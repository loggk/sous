import os
import uuid
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session

try:
    from .database import get_db
    from .models import User, Restaurant
except (ImportError, ValueError):
    from database import get_db
    from models import User, Restaurant

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")


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
                payload = jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
            else:
                # In development without secret, decode unverified
                payload = jwt.decode(token, options={"verify_signature": False})

            user_id_str = payload.get("sub")
            email = payload.get("email") or f"{user_id_str[:8]}@restaurant.local"

            if user_id_str:
                user_uuid = uuid.UUID(user_id_str)
                user = db.query(User).filter(User.id == user_uuid).first()

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

                    user = User(
                        id=user_uuid,
                        restaurant_id=restaurant.id,
                        email=email,
                        role="owner",
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)

                return user

        except jwt.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication token: {str(e)}",
            )
        except Exception as e:
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
