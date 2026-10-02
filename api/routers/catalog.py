from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

try:
    from ..database import get_db
    from ..models import CanonicalItem, Supplier
    from ..schemas import CanonicalItemOut
except (ImportError, ValueError):
    from database import get_db
    from models import CanonicalItem, Supplier
    from schemas import CanonicalItemOut

router = APIRouter(prefix="/catalog", tags=["Catalog"])


@router.get("/items", response_model=List[CanonicalItemOut])
def list_canonical_items(
    category: Optional[str] = Query(None),
    benchmarkable_only: bool = Query(False),
    q: Optional[str] = Query(None, description="Search query for autocomplete"),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List or search canonical items in the standard catalogue.
    """
    query = db.query(CanonicalItem)
    if category:
        query = query.filter(CanonicalItem.category == category)
    if benchmarkable_only:
        query = query.filter(CanonicalItem.benchmarkable == True)
    if q:
        query = query.filter(CanonicalItem.name.ilike(f"%{q}%"))

    return query.order_by(CanonicalItem.name).limit(limit).all()


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db)):
    """List known suppliers."""
    suppliers = db.query(Supplier).order_by(Supplier.canonical_name).all()
    return [
        {
            "id": s.id,
            "name": s.canonical_name,
            "is_broadline": s.is_broadline,
            "aliases": s.aliases
        }
        for s in suppliers
    ]
