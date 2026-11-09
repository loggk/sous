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


VALID_AUDIT_WINDOWS = [14, 30, 60, 90, 180, 365]


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
    window_days: int = Query(90, description="Rolling window: standard audit windows allowed (14, 30, 60, 90, 180, 365)"),
    radius_km: Optional[int] = Query(None, description="Target radius in km (3, 5, 10, 15, 25, 50, 100) or None for auto-ladder"),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve benchmark availability summary for all benchmarkable items.
    Returns whether regional price observations meet k-anonymity privacy thresholds.
    Supports user-selected trade radius filtering.
    """
    if window_days not in VALID_AUDIT_WINDOWS:
        raise HTTPException(status_code=400, detail=f"window_days must be one of {VALID_AUDIT_WINDOWS}.")

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
                n_restaurants=0,
                selected_radius_km=radius_km
            )
            for item in items
        ]

    try:
        # Attempt calling upgraded 4-parameter function with :target_radius_km
        sql = text("""
            SELECT 
                c.id AS canonical_item_id,
                c.name,
                c.category,
                c.base_unit,
                b.suppressed,
                b.n_restaurants,
                b.radius_km_used,
                b.p50 AS median,
                b.p25,
                b.p75
            FROM canonical_items c
            CROSS JOIN LATERAL get_benchmark(
                CAST(:restaurant_id AS UUID), 
                c.id, 
                CAST(:window_days AS INT), 
                CAST(:target_radius_km AS INT)
            ) b
            WHERE c.benchmarkable = true
            ORDER BY c.name
        """)
        rows = db.execute(sql, {
            "restaurant_id": str(restaurant_id),
            "window_days": window_days,
            "target_radius_km": radius_km
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
                selected_radius_km=radius_km,
                median=float(row.median) if row.median is not None else None,
                p25=float(row.p25) if row.p25 is not None else None,
                p75=float(row.p75) if row.p75 is not None else None,
            )
            for row in rows
        ]
    except Exception:
        db.rollback()
        # Fallback for pre-migration databases supporting 3 arguments
        try:
            sql_fallback = text("""
                SELECT 
                    c.id AS canonical_item_id,
                    c.name,
                    c.category,
                    c.base_unit,
                    b.suppressed,
                    b.n_restaurants,
                    b.radius_km_used,
                    b.p50 AS median,
                    b.p25,
                    b.p75
                FROM canonical_items c
                CROSS JOIN LATERAL get_benchmark(
                    CAST(:restaurant_id AS UUID), 
                    c.id, 
                    CAST(:window_days AS INT)
                ) b
                WHERE c.benchmarkable = true
                ORDER BY c.name
            """)
            rows = db.execute(sql_fallback, {
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
                    selected_radius_km=radius_km,
                    median=float(row.median) if row.median is not None else None,
                    p25=float(row.p25) if row.p25 is not None else None,
                    p75=float(row.p75) if row.p75 is not None else None,
                )
                for row in rows
            ]
        except Exception:
            db.rollback()
            items = db.query(CanonicalItem).filter(CanonicalItem.benchmarkable == True).order_by(CanonicalItem.name).all()
            return [
                BenchmarkSummaryItem(
                    id=item.id,
                    name=item.name,
                    category=item.category,
                    base_unit=item.base_unit,
                    has_data=False,
                    suppressed=True,
                    n_restaurants=0,
                    selected_radius_km=radius_km
                )
                for item in items
            ]


@router.get("/{canonical_item_id}", response_model=BenchmarkResponse)
def get_item_benchmark(
    canonical_item_id: uuid.UUID,
    window_days: int = Query(90, description="Rolling window: standard audit windows allowed (14, 30, 60, 90, 180, 365)"),
    radius_km: Optional[int] = Query(None, description="Target radius in km (3, 5, 10, 15, 25, 50, 100) or None for auto-ladder"),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve k-anonymous local price benchmark.
    Executes the secure get_benchmark SQL function in PostgreSQL.
    Supports user-selected trade radius filtering.
    """
    if window_days not in VALID_AUDIT_WINDOWS:
        raise HTTPException(status_code=400, detail=f"window_days must be one of {VALID_AUDIT_WINDOWS}.")

    # 1. Contribute-to-consume gating (Section 3.7)
    if not check_contribute_to_consume_entitlement(restaurant_id, db):
        raise HTTPException(
            status_code=403,
            detail="Benchmark access requires contributing validated invoice data. Upload invoices to unlock market benchmarks."
        )

    canonical = db.query(CanonicalItem).filter(CanonicalItem.id == canonical_item_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Canonical item not found")

    # 2. Call the stored procedure with optional target radius
    result = None
    try:
        sql = text("""
            SELECT 
                p25, p50 AS median, p75,
                n_restaurants, radius_km_used,
                window_start, window_end,
                suppressed, suppression_reason
            FROM get_benchmark(
                CAST(:restaurant_id AS UUID), 
                CAST(:canonical_item_id AS UUID), 
                CAST(:window_days AS INT), 
                CAST(:target_radius_km AS INT)
            )
        """)
        result = db.execute(sql, {
            "restaurant_id": str(restaurant_id),
            "canonical_item_id": str(canonical_item_id),
            "window_days": window_days,
            "target_radius_km": radius_km
        }).first()
    except Exception:
        db.rollback()
        # Fallback for pre-migration database function
        sql_fallback = text("""
            SELECT 
                p25, p50 AS median, p75,
                n_restaurants, radius_km_used,
                window_start, window_end,
                suppressed, suppression_reason
            FROM get_benchmark(
                CAST(:restaurant_id AS UUID), 
                CAST(:canonical_item_id AS UUID), 
                CAST(:window_days AS INT)
            )
        """)
        result = db.execute(sql_fallback, {
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
            tenant_latest_price=tenant_price,
            selected_radius_km=radius_km
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
        selected_radius_km=radius_km,
        window_start=result.window_start,
        window_end=result.window_end,
        suppressed=result.suppressed,
        suppression_reason=result.suppression_reason,
        tenant_latest_price=tenant_price
    )
