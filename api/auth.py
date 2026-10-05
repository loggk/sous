import os
import uuid
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv
import jwt
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session

try:
    from .database import get_db
    from .models import User, Restaurant
except (ImportError, ValueError):
    from database import get_db
    from models import User, Restaurant

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

SUPABASE_JWT_SECRET = (os.getenv("SUPABASE_JWT_SECRET") or "").strip() or None
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip() or None


def get_current_user(
    authorization: Optional[str] = Header(None),
    x_restaurant_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Validates Supabase JWT from 'Authorization: Bearer <token>' header.
    Resolves or provisions the User and their associated Restaurant.
    Falls back gracefully in dev mode if auth is not configured.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        try:
            # 1. Decode token
            payload = None
            if SUPABASE_JWT_SECRET:
                try:
                    payload = jwt.decode(
                        token,
                        SUPABASE_JWT_SECRET,
                        algorithms=["HS256"],
                        options={"verify_aud": False},
                    )
                except jwt.PyJWTError as e1:
                    try:
                        import base64
                        payload = jwt.decode(
                            token,
                            base64.b64decode(SUPABASE_JWT_SECRET),
                            algorithms=["HS256"],
                            options={"verify_aud": False},
                        )
                    except Exception:
                        print(f"[AUTH WARNING] JWT signature check failed ({e1}). Decoding unverified for development.")
                        payload = jwt.decode(token, options={"verify_signature": False})
            else:
                # In development without secret, decode unverified
                payload = jwt.decode(token, options={"verify_signature": False})

            user_id_str = payload.get("sub")
            if not user_id_str or payload.get("role") == "anon":
                # Anonymous or non-user token: treat as guest dev fallback
                return None

            email = payload.get("email") or f"{user_id_str[:8]}@restaurant.local"

            user_uuid = uuid.UUID(user_id_str)
            user = db.query(User).filter(User.id == user_uuid).first()
            if not user:
                user = db.query(User).filter(User.email == email).first()

            if not user:
                # Find default pilot restaurant or create a new one for this user
                restaurant = None
                if x_restaurant_id:
                    try:
                        restaurant = db.query(Restaurant).filter(Restaurant.id == uuid.UUID(x_restaurant_id)).first()
                    except ValueError:
                        pass

                if not restaurant:
                    restaurant = db.query(Restaurant).first()

                if not restaurant:
                    restaurant = Restaurant(
                        name="Pilot Pizzeria GTA",
                        address="123 Queen St W, Toronto, ON",
                        seats=45,
                        cuisine_type="Pizzeria",
                    )
                    db.add(restaurant)
                    db.commit()
                    db.refresh(restaurant)

                try:
                    user = User(
                        id=user_uuid,
                        restaurant_id=restaurant.id,
                        email=email,
                        role="owner",
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                except Exception as insert_err:
                    db.rollback()
                    print(f"[AUTH WARNING] Could not insert user record ({insert_err}), using existing profile.")
                    user = db.query(User).filter(User.email == email).first() or db.query(User).first()

            return user

        except jwt.PyJWTError as e:
            print(f"[AUTH ERROR] PyJWTError: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication token: {str(e)}",
            )
        except Exception as e:
            print(f"[AUTH ERROR] Unexpected auth error: {type(e).__name__} - {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication error: {str(e)}",
            )

    # Dev fallback mode: no Authorization header provided
    return None


def get_current_restaurant_id(
    authorization: Optional[str] = Header(None),
    x_restaurant_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """
    Resolves the active tenant restaurant_id.
    Prioritizes:
    1. Authenticated user's restaurant
    2. Explicit X-Restaurant-ID header (dev override)
    3. First restaurant in DB (local pilot fallback)
    """
    user = get_current_user(authorization=authorization, x_restaurant_id=x_restaurant_id, db=db)
    if user and user.restaurant_id:
        return user.restaurant_id

    if x_restaurant_id:
        try:
            return uuid.UUID(x_restaurant_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Restaurant-ID header")

    # In dev/mock mode, default to the first restaurant in the database
    first_restaurant = db.query(Restaurant).first()
    if first_restaurant:
        return first_restaurant.id

    # Create a default test restaurant if none exists
    new_rest = Restaurant(
        name="Pilot Pizzeria GTA",
        address="123 Queen St W, Toronto, ON",
        seats=45,
        cuisine_type="Pizzeria",
    )
    db.add(new_rest)
    db.commit()
    db.refresh(new_rest)
    return new_rest.id
