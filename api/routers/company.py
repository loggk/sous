import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

try:
    from ..database import get_db
    from ..models import User, Restaurant, Organization, UserRestaurant, OrganizationInvitation
    from ..schemas import (
        CompanyOut,
        RestaurantSummaryOut,
        CompanyRegisterRequest,
        TeamMemberOut,
        TeamInvitationOut,
        InviteTeamMemberRequest,
        UpdateUserAssignmentsRequest,
        AddLocationRequest,
    )
    from ..auth import get_current_user, get_current_restaurant_id
except (ImportError, ValueError):
    from database import get_db
    from models import User, Restaurant, Organization, UserRestaurant, OrganizationInvitation
    from schemas import (
        CompanyOut,
        RestaurantSummaryOut,
        CompanyRegisterRequest,
        TeamMemberOut,
        TeamInvitationOut,
        InviteTeamMemberRequest,
        UpdateUserAssignmentsRequest,
        AddLocationRequest,
    )
    from auth import get_current_user, get_current_restaurant_id

router = APIRouter(prefix="/company", tags=["Company & Tenancy"])


def resolve_active_organization(
    user: Optional[User],
    restaurant_id: uuid.UUID,
    db: Session,
) -> Organization:
    """
    Resolves the organization for the current context.
    If authenticated user has an organization_id, returns it.
    Otherwise resolves via restaurant_id.
    """
    if user and user.organization_id:
        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        if org:
            return org

    # Fallback to restaurant's organization
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Active restaurant not found")

    if restaurant.organization_id:
        org = db.query(Organization).filter(Organization.id == restaurant.organization_id).first()
        if org:
            if user and not user.organization_id:
                user.organization_id = org.id
                db.commit()
            return org

    # Auto-provision organization if missing
    org = Organization(name=f"{restaurant.name} Group")
    db.add(org)
    db.flush()
    restaurant.organization_id = org.id
    if user and not user.organization_id:
        user.organization_id = org.id
    db.commit()
    db.refresh(org)
    return org


def require_owner(user: Optional[User]):
    """
    Ensures the user has owner/admin privileges.
    Allows unauthenticated access in dev/demo mode.
    """
    if user and user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required: Only company owners and administrators can manage team members, locations, and venue assignments.",
        )


@router.get("/me", response_model=CompanyOut)
def get_current_company(
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Returns the organization details for the current user, including all venues
    in the company and the list of venue IDs the user is assigned to.
    """
    org = resolve_active_organization(user, restaurant_id, db)
    venues = db.query(Restaurant).filter(Restaurant.organization_id == org.id).order_by(Restaurant.name.asc()).all()
    venue_summaries = [RestaurantSummaryOut.model_validate(v) for v in venues]

    if user:
        assignments = db.query(UserRestaurant.restaurant_id).filter(UserRestaurant.user_id == user.id).all()
        assigned_ids = [a[0] for a in assignments]
        # If user has no explicit assignments yet, assign all org venues by default
        if not assigned_ids and venues:
            assigned_ids = [v.id for v in venues]
            for v_id in assigned_ids:
                db.add(UserRestaurant(user_id=user.id, restaurant_id=v_id))
            db.commit()
    else:
        # Dev fallback: all venues are accessible
        assigned_ids = [v.id for v in venues]

    is_owner = (user is None or user.role in ["owner", "admin"])
    user_role = user.role if user else "owner"

    return CompanyOut(
        id=org.id,
        name=org.name,
        restaurants=venue_summaries,
        assigned_restaurant_ids=assigned_ids,
        is_owner=is_owner,
        user_role=user_role,
    )


@router.post("/register", response_model=CompanyOut)
def register_company(
    payload: CompanyRegisterRequest,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Self-serve registration: creates a new Company (Organization) and its first
    Restaurant location. Links the current user (or provisions user by admin_email).
    """
    email_clean = payload.admin_email.strip().lower()
    if not email_clean:
        raise HTTPException(status_code=400, detail="Admin email is required")
    if not payload.company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required")
    if not payload.restaurant_name.strip():
        raise HTTPException(status_code=400, detail="Location name is required")

    # 1. Create Organization
    org = Organization(name=payload.company_name.strip())
    db.add(org)
    db.flush()

    # 2. Create Initial Restaurant
    restaurant = Restaurant(
        organization_id=org.id,
        name=payload.restaurant_name.strip(),
        address=payload.address.strip() if payload.address else None,
        cuisine_type=payload.cuisine_type.strip() if payload.cuisine_type else None,
        seats=50,
    )
    db.add(restaurant)
    db.flush()

    # 3. Associate or create User
    target_user = user
    if not target_user:
        target_user = db.query(User).filter(User.email.ilike(email_clean)).first()

    if target_user:
        target_user.organization_id = org.id
        target_user.restaurant_id = restaurant.id
        target_user.role = "owner"
    else:
        target_user = User(
            organization_id=org.id,
            restaurant_id=restaurant.id,
            email=email_clean,
            role="owner",
        )
        db.add(target_user)
        db.flush()

    # 4. Link User to Restaurant
    existing_link = db.query(UserRestaurant).filter(
        UserRestaurant.user_id == target_user.id,
        UserRestaurant.restaurant_id == restaurant.id,
    ).first()
    if not existing_link:
        db.add(UserRestaurant(user_id=target_user.id, restaurant_id=restaurant.id))

    db.commit()
    db.refresh(org)
    db.refresh(restaurant)

    return CompanyOut(
        id=org.id,
        name=org.name,
        restaurants=[RestaurantSummaryOut.model_validate(restaurant)],
        assigned_restaurant_ids=[restaurant.id],
    )


@router.post("/locations", response_model=RestaurantSummaryOut)
def add_location(
    payload: AddLocationRequest,
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Adds a new restaurant location to the company. Automatically assigns the
    creator to this new venue.
    """
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Location name is required")

    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    new_restaurant = Restaurant(
        organization_id=org.id,
        name=payload.name.strip(),
        address=payload.address.strip() if payload.address else None,
        cuisine_type=payload.cuisine_type.strip() if payload.cuisine_type else None,
        seats=50,
    )
    db.add(new_restaurant)
    db.flush()

    # If user is present, assign them to this location
    if user:
        db.add(UserRestaurant(user_id=user.id, restaurant_id=new_restaurant.id))

    db.commit()
    db.refresh(new_restaurant)
    return RestaurantSummaryOut.model_validate(new_restaurant)


@router.get("/team", response_model=Dict[str, Any])
def list_team(
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Lists all members and pending invitations in the active company.
    """
    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    # 1. Fetch all venues in org for lookup
    org_venues = {
        r.id: RestaurantSummaryOut.model_validate(r)
        for r in db.query(Restaurant).filter(Restaurant.organization_id == org.id).all()
    }

    # 2. Fetch users in org
    users = db.query(User).filter(User.organization_id == org.id).order_by(User.email.asc()).all()
    members_out = []
    for u in users:
        assignments = db.query(UserRestaurant.restaurant_id).filter(UserRestaurant.user_id == u.id).all()
        assigned_ids = [a[0] for a in assignments if a[0] in org_venues]
        # If user has no explicit user_restaurant rows, fallback to primary restaurant_id
        if not assigned_ids and u.restaurant_id and u.restaurant_id in org_venues:
            assigned_ids = [u.restaurant_id]

        members_out.append(
            TeamMemberOut(
                id=u.id,
                email=u.email,
                role=u.role or "member",
                assigned_restaurant_ids=assigned_ids,
                assigned_restaurants=[org_venues[rid] for rid in assigned_ids if rid in org_venues],
            )
        )

    # 3. Fetch invitations
    invites = (
        db.query(OrganizationInvitation)
        .filter(OrganizationInvitation.organization_id == org.id)
        .order_by(OrganizationInvitation.created_at.desc())
        .all()
    )
    invites_out = [TeamInvitationOut.model_validate(inv) for inv in invites]

    return {
        "company_id": org.id,
        "company_name": org.name,
        "members": [m.model_dump() for m in members_out],
        "invitations": [i.model_dump() for i in invites_out],
    }


@router.post("/team/invite")
def invite_team_member(
    payload: InviteTeamMemberRequest,
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Invites a team member by email and assigns them to selected restaurants.
    If the user already exists, links them directly to the company.
    Otherwise saves an OrganizationInvitation for when they first log in.
    """
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="A valid email address is required")

    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    # Validate that all restaurant_ids belong to this company
    valid_venue_ids = {
        r.id for r in db.query(Restaurant.id).filter(Restaurant.organization_id == org.id).all()
    }
    target_restaurant_ids = [rid for rid in payload.restaurant_ids if rid in valid_venue_ids]
    if not target_restaurant_ids:
        # Default to all venues in company if none matched
        target_restaurant_ids = list(valid_venue_ids)

    # Check if user already exists
    existing_user = db.query(User).filter(User.email.ilike(clean_email)).first()
    if existing_user:
        existing_user.organization_id = org.id
        if target_restaurant_ids:
            existing_user.restaurant_id = target_restaurant_ids[0]

        # Reset and assign venues
        db.query(UserRestaurant).filter(UserRestaurant.user_id == existing_user.id).delete()
        for rid in target_restaurant_ids:
            db.add(UserRestaurant(user_id=existing_user.id, restaurant_id=rid))

        db.commit()
        return {
            "status": "added",
            "message": f"{clean_email} was added directly to {org.name}.",
            "user_id": existing_user.id,
        }

    # Otherwise upsert into organization_invitations
    existing_invite = (
        db.query(OrganizationInvitation)
        .filter(
            OrganizationInvitation.organization_id == org.id,
            OrganizationInvitation.email.ilike(clean_email),
        )
        .first()
    )
    if existing_invite:
        existing_invite.restaurant_ids = target_restaurant_ids
    else:
        new_invite = OrganizationInvitation(
            organization_id=org.id,
            email=clean_email,
            restaurant_ids=target_restaurant_ids,
        )
        db.add(new_invite)

    db.commit()
    return {
        "status": "invited",
        "message": f"Invitation created for {clean_email}. They will automatically join upon signing in.",
    }


@router.put("/team/{target_user_id}/restaurants")
def update_user_assignments(
    target_user_id: uuid.UUID,
    payload: UpdateUserAssignmentsRequest,
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Updates the restaurant venue assignments for a user in the company.
    """
    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    target_user = (
        db.query(User)
        .filter(User.id == target_user_id, User.organization_id == org.id)
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="Team member not found in this company")

    # Filter to only valid venues belonging to this org
    valid_venue_ids = {
        r.id for r in db.query(Restaurant.id).filter(Restaurant.organization_id == org.id).all()
    }
    requested_ids = [rid for rid in payload.restaurant_ids if rid in valid_venue_ids]

    if not requested_ids:
        raise HTTPException(status_code=400, detail="Must assign member to at least one valid restaurant")

    # Replace user_restaurants
    db.query(UserRestaurant).filter(UserRestaurant.user_id == target_user.id).delete()
    for rid in requested_ids:
        db.add(UserRestaurant(user_id=target_user.id, restaurant_id=rid))

    target_user.restaurant_id = requested_ids[0]
    db.commit()

    return {"status": "success", "assigned_restaurant_ids": requested_ids}


@router.delete("/team/{target_user_id}")
def remove_team_member(
    target_user_id: uuid.UUID,
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Removes a member from the company.
    """
    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    target_user = (
        db.query(User)
        .filter(User.id == target_user_id, User.organization_id == org.id)
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="Team member not found in this company")

    # Remove assignments
    db.query(UserRestaurant).filter(UserRestaurant.user_id == target_user.id).delete()
    target_user.organization_id = None
    target_user.restaurant_id = None
    db.commit()

    return {"status": "success", "message": "Team member removed from company"}


@router.delete("/team/invitations/{invite_id}")
def cancel_invitation(
    invite_id: uuid.UUID,
    user: Optional[User] = Depends(get_current_user),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Cancels a pending team invitation.
    """
    require_owner(user)
    org = resolve_active_organization(user, restaurant_id, db)

    invite = (
        db.query(OrganizationInvitation)
        .filter(
            OrganizationInvitation.id == invite_id,
            OrganizationInvitation.organization_id == org.id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")

    db.delete(invite)
    db.commit()
    return {"status": "success", "message": "Invitation canceled"}
