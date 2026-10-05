import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

try:
    from ..database import get_db
    from ..models import CanonicalItem, InvoiceLine, Invoice
    from ..schemas import BenchmarkResponse, BenchmarkSummaryItem
    from .invoices import get_current_restaurant_id
except (ImportError, ValueError):
    from database import get_db
    from models import CanonicalItem, InvoiceLine, Invoice
    from schemas import BenchmarkResponse, BenchmarkSummaryItem
    from routers.invoices import get_current_restaurant_id

router = APIRouter(prefix="/benchmarks", tags=["Geospatial Benchmarks"])


def check_contribute_to_consume_entitlement(restaurant_id: uuid.UUID, db: Session) -> bool:
    """
    Enforces contribute-to-consume:
    Tenant must have contributed at least 1 validated invoice with line items.
    """
    count = db.query(Invoice).filter(
        Invoice.restaurant_id == restaurant_id,
        Invoice.validation_status.in_(["passed", "review_needed"])
    ).count()
    return count > 0


@router.get("/summary", response_model=List[BenchmarkSummaryItem])
def get_benchmarks_summary(
    window_days: int = Query(90, description="Rolling window: only 30 or 90 days allowed"),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve benchmark availability summary for all benchmarkable items.
    Returns whether regional price observations meet k-anonymity privacy thresholds.
    """
    if window_days not in [30, 90]:
        raise HTTPException(status_code=400, detail="window_days must be either 30 or 90.")

    # Check contribute-to-consume entitlement
    is_entitled = check_contribute_to_consume_entitlement(restaurant_id, db)
    if not is_entitled:
        items = db.query(CanonicalItem).filter(CanonicalItem.benchmarkable == True).order_by(CanonicalItem.name).all()
        return [
            BenchmarkSummaryItem(
                id=item.id,
                name=item.name,
                category=item.category,
                base_unit=item.base_unit,
                has_data=False,
                suppressed=True,
                n_restaurants=0
            )
            for item in items
        ]

    try:
        sql = text("""
            SELECT 
                c.id AS canonical_item_id,
                c.name,
                c.category,
                c.base_unit,
                b.suppressed,
                b.n_restaurants,
                b.radius_km_used,
                b.median,
                b.p25,
                b.p75
            FROM canonical_items c
            CROSS JOIN LATERAL get_benchmark(:restaurant_id, c.id, :window_days) b
            WHERE c.benchmarkable = true
            ORDER BY c.name
        """)
        rows = db.execute(sql, {
            "restaurant_id": str(restaurant_id),
            "window_days": window_days
        }).fetchall()

        return [
            BenchmarkSummaryItem(
                id=row.canonical_item_id,
                name=row.name,
                category=row.category,
                base_unit=row.base_unit,
                has_data=not bool(row.suppressed),
                suppressed=bool(row.suppressed),
                n_restaurants=row.n_restaurants or 0,
                radius_km_used=row.radius_km_used,
                median=float(row.median) if row.median is not None else None,
                p25=float(row.p25) if row.p25 is not None else None,
                p75=float(row.p75) if row.p75 is not None else None,
            )
            for row in rows
        ]
    except Exception:
        items = db.query(CanonicalItem).filter(CanonicalItem.benchmarkable == True).order_by(CanonicalItem.name).all()
        return [
            BenchmarkSummaryItem(
                id=item.id,
                name=item.name,
                category=item.category,
                base_unit=item.base_unit,
                has_data=False,
                suppressed=True,
                n_restaurants=0
            )
            for item in items
        ]


@router.get("/{canonical_item_id}", response_model=BenchmarkResponse)
def get_item_benchmark(
    canonical_item_id: uuid.UUID,
    window_days: int = Query(30, description="Rolling window: only 30 or 90 days allowed"),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve k-anonymous local price benchmark.
    Executes the secure get_benchmark SQL function in PostgreSQL.
    """
    if window_days not in [30, 90]:
        raise HTTPException(status_code=400, detail="window_days must be either 30 or 90.")

    # 1. Contribute-to-consume gating (Section 3.7)
    if not check_contribute_to_consume_entitlement(restaurant_id, db):
        raise HTTPException(
            status_code=403,
            detail="Benchmark access requires contributing validated invoice data. Upload invoices to unlock market benchmarks."
        )

    canonical = db.query(CanonicalItem).filter(CanonicalItem.id == canonical_item_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Canonical item not found")

    # 2. Call the single SQL function
    sql = text("""
        SELECT 
            p25, p50 AS median, p75,
            n_restaurants, radius_km_used,
            window_start, window_end,
            suppressed, suppression_reason
        FROM get_benchmark(:restaurant_id, :canonical_item_id, :window_days)
    """)
    result = db.execute(sql, {
        "restaurant_id": str(restaurant_id),
        "canonical_item_id": str(canonical_item_id),
        "window_days": window_days
    }).first()

    # 3. Find tenant's latest price for comparison
    latest_line = (
        db.query(InvoiceLine)
        .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
        .filter(
            Invoice.restaurant_id == restaurant_id,
            InvoiceLine.canonical_item_id == canonical_item_id,
            InvoiceLine.price_per_base_unit.isnot(None)
        )
        .order_by(Invoice.invoice_date.desc())
        .first()
    )
    tenant_price = float(latest_line.price_per_base_unit) if latest_line else None

    if not result:
        return BenchmarkResponse(
            canonical_item_id=canonical.id,
            canonical_item_name=canonical.name,
            base_unit=canonical.base_unit,
            n_restaurants=0,
            suppressed=True,
            suppression_reason="No benchmark data available.",
            tenant_latest_price=tenant_price
        )

    return BenchmarkResponse(
        canonical_item_id=canonical.id,
        canonical_item_name=canonical.name,
        base_unit=canonical.base_unit,
        p25=float(result.p25) if result.p25 is not None else None,
        median=float(result.median) if result.median is not None else None,
        p75=float(result.p75) if result.p75 is not None else None,
        n_restaurants=result.n_restaurants,
        radius_km_used=result.radius_km_used,
        window_start=result.window_start,
        window_end=result.window_end,
        suppressed=result.suppressed,
        suppression_reason=result.suppression_reason,
        tenant_latest_price=tenant_price
    )
