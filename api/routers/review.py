import uuid
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

try:
    from ..database import get_db
    from ..models import (
        ReviewItem,
        InvoiceLine,
        Invoice,
        SkuMapping,
        CanonicalItem,
        BenchmarkObservation,
        Restaurant,
    )
    from ..schemas import ReviewItemOut, ResolveReviewRequest
    from ..services.pipeline import convert_to_base_unit
except (ImportError, ValueError):
    from database import get_db
    from models import (
        ReviewItem,
        InvoiceLine,
        Invoice,
        SkuMapping,
        CanonicalItem,
        BenchmarkObservation,
        Restaurant,
    )
    from schemas import ReviewItemOut, ResolveReviewRequest
    from services.pipeline import convert_to_base_unit

router = APIRouter(prefix="/review", tags=["Review Queue"])


@router.get("", response_model=List[ReviewItemOut])
def get_pending_reviews(
    kind: Optional[str] = Query(None, description="extraction | mapping | pack_parse"),
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Get items requiring human-in-the-loop review.
    Tailored for keyboard-first navigation in the frontend review queue.
    """
    query = db.query(ReviewItem).filter(ReviewItem.status == "pending")
    if kind:
        query = query.filter(ReviewItem.kind == kind)
    return query.limit(limit).all()


@router.post("/{review_id}/resolve")
def resolve_review_item(
    review_id: uuid.UUID,
    payload: ResolveReviewRequest,
    db: Session = Depends(get_db)
):
    """
    Resolve a review item:
    1. Maps the invoice line to the canonical item.
    2. Writes to sku_mappings cache (supplier_id, supplier_sku) -> canonical_item_id so it never needs review again.
    3. Computes price_per_base_unit.
    4. Materializes benchmark observation.
    """
    review = db.query(ReviewItem).filter(ReviewItem.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")

    canonical = db.query(CanonicalItem).filter(CanonicalItem.id == payload.canonical_item_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Canonical item not found")

    line = db.query(InvoiceLine).filter(InvoiceLine.id == review.invoice_line_id).first() if review.invoice_line_id else None
    invoice = db.query(Invoice).filter(Invoice.id == review.invoice_id).first() if review.invoice_id else None

    if line and invoice:
        # Update line item mapping and packaging
        line.canonical_item_id = canonical.id
        line.pack_units = payload.pack_units
        line.pack_size = payload.pack_size
        line.pack_measure = payload.pack_measure

        # Calculate unit economics
        if payload.pack_size and payload.pack_measure:
            total_base_units = (
                float(line.quantity)
                * payload.pack_units
                * convert_to_base_unit(float(payload.pack_size), payload.pack_measure, canonical.base_unit)
            )
            if total_base_units > 0:
                line.price_per_base_unit = round(float(line.line_total) / total_base_units, 4)

        # Update persistent SKU normalization cache
        if payload.update_sku_cache and line.supplier_sku:
            existing_mapping = db.query(SkuMapping).filter(
                SkuMapping.supplier_id == invoice.supplier_id,
                SkuMapping.supplier_sku == line.supplier_sku
            ).first()

            if not existing_mapping:
                mapping = SkuMapping(
                    supplier_id=invoice.supplier_id,
                    supplier_sku=line.supplier_sku,
                    canonical_item_id=canonical.id,
                    pack_units=payload.pack_units,
                    pack_size=payload.pack_size,
                    pack_measure=payload.pack_measure,
                    confidence=1.0,
                    confirmed_at=datetime.utcnow()
                )
                db.add(mapping)

        # Materialize benchmark observation if item is benchmarkable
        restaurant = db.query(Restaurant).filter(Restaurant.id == invoice.restaurant_id).first()
        if canonical.benchmarkable and line.price_per_base_unit and restaurant and restaurant.geom:
            obs = BenchmarkObservation(
                restaurant_id=restaurant.id,
                canonical_item_id=canonical.id,
                supplier_id=invoice.supplier_id,
                observed_on=invoice.invoice_date,
                price_per_base_unit=line.price_per_base_unit,
                geom=restaurant.geom
            )
            db.add(obs)

    review.status = "resolved"
    review.resolved_at = datetime.utcnow()
    db.commit()

    return {"status": "ok", "message": "Review item resolved and SKU cache updated."}


@router.post("/{review_id}/dismiss")
def dismiss_review_item(
    review_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """Dismiss a review item."""
    review = db.query(ReviewItem).filter(ReviewItem.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review item not found")

    review.status = "dismissed"
    review.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "ok", "message": "Review item dismissed."}
