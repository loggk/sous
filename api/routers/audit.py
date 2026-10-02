import uuid
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

try:
    from ..database import get_db
    from ..models import Invoice, InvoiceLine, CanonicalItem, Supplier
    from ..schemas import SpendSummaryOut
    from .invoices import get_current_restaurant_id
except (ImportError, ValueError):
    from database import get_db
    from models import Invoice, InvoiceLine, CanonicalItem, Supplier
    from schemas import SpendSummaryOut
    from routers.invoices import get_current_restaurant_id

router = APIRouter(prefix="/audit", tags=["Internal Audit"])


@router.get("/spend", response_model=SpendSummaryOut)
def get_spend_summary(
    days: int = Query(90, description="Trailing days for spend analysis"),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Spend breakdown by category, by supplier, and total fees over rolling window.
    """
    start_date = date.today() - timedelta(days=days)

    # 1. Total spend across invoices
    invoices = db.query(Invoice).filter(
        Invoice.restaurant_id == restaurant_id,
        Invoice.invoice_date >= start_date
    ).all()
    total_spend = sum(float(inv.total) for inv in invoices)

    # 2. Spend by Supplier
    supplier_spend_rows = (
        db.query(Supplier.canonical_name, func.sum(Invoice.total))
        .join(Invoice, Invoice.supplier_id == Supplier.id)
        .filter(Invoice.restaurant_id == restaurant_id, Invoice.invoice_date >= start_date)
        .group_by(Supplier.canonical_name)
        .all()
    )
    by_supplier = {name: float(amount) for name, amount in supplier_spend_rows}

    # 3. Spend by Category
    category_spend_rows = (
        db.query(CanonicalItem.category, func.sum(InvoiceLine.line_total))
        .join(CanonicalItem, InvoiceLine.canonical_item_id == CanonicalItem.id)
        .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
        .filter(Invoice.restaurant_id == restaurant_id, Invoice.invoice_date >= start_date)
        .group_by(CanonicalItem.category)
        .all()
    )
    by_category = {cat: float(amount) for cat, amount in category_spend_rows}

    # 4. Total Fees and Surcharges (fuel, delivery, etc.)
    fee_total_row = (
        db.query(func.coalesce(func.sum(InvoiceLine.line_total), 0))
        .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
        .filter(
            Invoice.restaurant_id == restaurant_id,
            Invoice.invoice_date >= start_date,
            InvoiceLine.line_kind == "fee"
        )
        .scalar()
    )
    fees_total = float(fee_total_row or 0.0)

    return SpendSummaryOut(
        total_spend=total_spend,
        by_category=by_category,
        by_supplier=by_supplier,
        fees_total=fees_total
    )


@router.get("/items")
def get_item_price_history(
    canonical_item_id: Optional[uuid.UUID] = None,
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Price history per canonical item with supplier attribution and price-per-base-unit.
    """
    query = (
        db.query(
            Invoice.invoice_date,
            Supplier.canonical_name.label("supplier_name"),
            CanonicalItem.name.label("item_name"),
            CanonicalItem.base_unit,
            InvoiceLine.price_per_base_unit,
            InvoiceLine.quantity,
            InvoiceLine.line_total
        )
        .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
        .join(Supplier, Invoice.supplier_id == Supplier.id)
        .join(CanonicalItem, InvoiceLine.canonical_item_id == CanonicalItem.id)
        .filter(
            Invoice.restaurant_id == restaurant_id,
            InvoiceLine.price_per_base_unit.isnot(None)
        )
    )

    if canonical_item_id:
        query = query.filter(InvoiceLine.canonical_item_id == canonical_item_id)

    records = query.order_by(Invoice.invoice_date.desc()).all()

    return [
        {
            "invoice_date": r.invoice_date,
            "supplier_name": r.supplier_name,
            "item_name": r.item_name,
            "base_unit": r.base_unit,
            "price_per_base_unit": float(r.price_per_base_unit),
            "quantity": float(r.quantity),
            "line_total": float(r.line_total)
        }
        for r in records
    ]


@router.get("/alerts")
def get_price_change_alerts(
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    min_dollar_floor: float = 5.0,
    db: Session = Depends(get_db)
):
    """
    Price-Change Alerting (Section 3.6):
    Flags items where latest unit price exceeds trailing baseline median,
    filtered by minimum absolute-dollar-impact floor.
    """
    # Fetch distinct canonical items purchased by this tenant
    distinct_items = (
        db.query(CanonicalItem.id, CanonicalItem.name, CanonicalItem.base_unit)
        .join(InvoiceLine, InvoiceLine.canonical_item_id == CanonicalItem.id)
        .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
        .filter(Invoice.restaurant_id == restaurant_id)
        .distinct()
        .all()
    )

    alerts = []

    for item_id, item_name, base_unit in distinct_items:
        # Get historical prices for this item ordered by date desc
        prices = (
            db.query(InvoiceLine.price_per_base_unit, InvoiceLine.line_total)
            .join(Invoice, InvoiceLine.invoice_id == Invoice.id)
            .filter(
                Invoice.restaurant_id == restaurant_id,
                InvoiceLine.canonical_item_id == item_id,
                InvoiceLine.price_per_base_unit.isnot(None)
            )
            .order_by(Invoice.invoice_date.desc())
            .limit(10)
            .all()
        )

        if len(prices) >= 2:
            latest_price = float(prices[0].price_per_base_unit)
            latest_total = float(prices[0].line_total)
            prev_prices = [float(p.price_per_base_unit) for p in prices[1:]]

            # Trailing median
            prev_prices.sort()
            median_prev = prev_prices[len(prev_prices) // 2]

            diff = latest_price - median_prev
            if diff > 0 and median_prev > 0:
                pct_change = (diff / median_prev) * 100.0
                dollar_impact = diff * (latest_total / latest_price if latest_price > 0 else 1)

                if dollar_impact >= min_dollar_floor:
                    alerts.append({
                        "canonical_item_id": item_id,
                        "item_name": item_name,
                        "base_unit": base_unit,
                        "latest_price": round(latest_price, 4),
                        "baseline_median": round(median_prev, 4),
                        "percent_increase": round(pct_change, 1),
                        "estimated_dollar_impact": round(dollar_impact, 2),
                        "classification": "supplier-specific",  # can be enriched with cohort check
                    })

    return alerts
