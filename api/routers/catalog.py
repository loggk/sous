from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

try:
    from ..database import get_db
    from ..models import CanonicalItem, Supplier
    from ..schemas import CanonicalItemOut
    from ..services.embeddings import generate_embedding
except (ImportError, ValueError):
    from database import get_db
    from models import CanonicalItem, Supplier
    from schemas import CanonicalItemOut
    from services.embeddings import generate_embedding

router = APIRouter(prefix="/catalog", tags=["Catalog"])


@router.get("/items", response_model=List[CanonicalItemOut])
def list_canonical_items(
    category: Optional[str] = Query(default=None),
    benchmarkable_only: bool = Query(default=False),
    q: Optional[str] = Query(default=None, description="Search query for autocomplete"),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List or search canonical items in the standard catalogue.
    When a search query is provided, uses semantic vector similarity to rank items.
    """
    query = db.query(CanonicalItem)
    if category and isinstance(category, str):
        query = query.filter(CanonicalItem.category == category)
    if isinstance(benchmarkable_only, bool) and benchmarkable_only is True:
        query = query.filter(CanonicalItem.benchmarkable == True)
    if q and isinstance(q, str):
        query_vec = generate_embedding(q)
        return query.filter(CanonicalItem.embedding.isnot(None)).order_by(
            CanonicalItem.embedding.cosine_distance(query_vec)
        ).limit(limit).all()

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
