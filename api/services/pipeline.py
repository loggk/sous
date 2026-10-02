import re
import uuid
import hashlib
from datetime import date, datetime
from typing import Optional, Tuple, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select

try:
    from ..models import (
        Document,
        Invoice,
        InvoiceLine,
        Supplier,
        CanonicalItem,
        SkuMapping,
        ReviewItem,
        BenchmarkObservation,
        Restaurant,
    )
except (ImportError, ValueError):
    from models import (
        Document,
        Invoice,
        InvoiceLine,
        Supplier,
        CanonicalItem,
        SkuMapping,
        ReviewItem,
        BenchmarkObservation,
        Restaurant,
    )


def compute_sha256(content: bytes) -> str:
    """Computes SHA-256 hash for immutable content deduplication."""
    return hashlib.sha256(content).hexdigest()


def parse_pack_descriptor(descriptor: Optional[str]) -> Tuple[int, Optional[float], Optional[str]]:
    """
    Parses pack descriptors like '20lb', '6/4L', '2x5kg', 'CS/24', '24/500ml', 'EA', 'BU', 'CT'.
    Returns (pack_units, pack_size, pack_measure).
    """
    if not descriptor:
        return 1, 1.0, "each"

    desc = descriptor.strip().upper()

    # Simple unit indicators
    if desc in ["EA", "EACH", "CT", "COUNT", "BU", "BUNCH", "PC", "PIECE"]:
        return 1, 1.0, "each"

    # Multi-pack patterns like '6/4L' or '6/4 L'
    m = re.match(r"^(\d+)\s*/\s*(\d+(?:\.\d+)?)\s*([A-Z#]+)$", desc)
    if m:
        units = int(m.group(1))
        size = float(m.group(2))
        unit_str = m.group(3)
        return units, size, normalize_measure(unit_str)

    # Multi-pack patterns like '2X5KG'
    m = re.match(r"^(\d+)\s*[Xx]\s*(\d+(?:\.\d+)?)\s*([A-Z#]+)$", desc)
    if m:
        units = int(m.group(1))
        size = float(m.group(2))
        unit_str = m.group(3)
        return units, size, normalize_measure(unit_str)

    # Single pack patterns like '20LB', '20#', '5KG', '4L'
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([A-Z#]+)$", desc)
    if m:
        size = float(m.group(1))
        unit_str = m.group(2)
        return 1, size, normalize_measure(unit_str)

    # CS/24 or CS 24
    m = re.match(r"^CS\s*[/]?\s*(\d+)$", desc)
    if m:
        return int(m.group(1)), 1.0, "each"

    # Fallback default
    return 1, 1.0, "each"


def normalize_measure(measure: str) -> str:
    measure = measure.strip().upper()
    if measure in ["LB", "LBS", "#"]:
        return "lb"
    if measure in ["KG", "KGS", "KILO"]:
        return "kg"
    if measure in ["L", "LT", "LTR", "LITER", "LITRE"]:
        return "L"
    if measure in ["ML", "MILLILITER"]:
        return "ml"
    if measure in ["OZ", "OUNCE"]:
        return "oz"
    return "each"


def convert_to_base_unit(size: float, measure: str, target_base_unit: str) -> float:
    """Converts a parsed unit size to canonical base unit (kg, L, each)."""
    measure = measure.lower()
    target_base_unit = target_base_unit.lower()

    if target_base_unit == "kg":
        if measure == "lb":
            return size * 0.45359237
        elif measure == "kg":
            return size
        elif measure == "oz":
            return size * 0.0283495
    elif target_base_unit == "l":
        if measure in ["l", "liter", "litre"]:
            return size
        elif measure == "ml":
            return size / 1000.0
    return size


def validate_arithmetic(
    lines: List[Dict[str, Any]],
    subtotal: Optional[float],
    tax: Optional[float],
    total: float,
    tolerance: float = 0.05
) -> Tuple[bool, List[str]]:
    """
    Mandatory arithmetic verification:
    1. sum(line_totals) + tax ≈ total
    2. quantity * unit_price ≈ line_total
    """
    errors = []
    calculated_subtotal = 0.0

    for idx, line in enumerate(lines):
        qty = float(line.get("quantity", 0))
        price = float(line.get("unit_price", 0))
        ltotal = float(line.get("line_total", 0))
        calculated_subtotal += ltotal

        expected_line_total = round(qty * price, 2)
        if abs(expected_line_total - ltotal) > 0.02:
            errors.append(
                f"Line {idx + 1} arithmetic mismatch: {qty} x {price} = {expected_line_total}, but line total is {ltotal}"
            )

    tax_val = float(tax or 0.0)
    expected_total = calculated_subtotal + tax_val

    if abs(expected_total - float(total)) > tolerance:
        errors.append(
            f"Invoice total mismatch: sum of lines ({calculated_subtotal}) + tax ({tax_val}) = "
            f"{expected_total:.2f}, but reported total is {float(total):.2f}"
        )

    return (len(errors) == 0), errors


def process_invoice_document(db: Session, document_id: uuid.UUID):
    """
    Background Task: Process uploaded document through extraction, validation, and normalization.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return

    doc.status = "processing"
    db.commit()

    try:
        # 1. Extraction: In prototype Phase 0/1, use supplier or mock payload
        # Find or create a default broadline distributor (e.g. Sysco GTA)
        supplier = db.query(Supplier).filter(Supplier.canonical_name == "Sysco GTA").first()
        if not supplier:
            supplier = Supplier(
                canonical_name="Sysco GTA",
                aliases=["Sysco", "Sysco Toronto", "Sysco Central Ontario"],
                is_broadline=True
            )
            db.add(supplier)
            db.flush()

        # Check for logical duplicate: same supplier + invoice_number + restaurant
        inv_number = f"INV-{doc.content_sha256[:8].upper()}"
        existing_invoice = db.query(Invoice).filter(
            Invoice.restaurant_id == doc.restaurant_id,
            Invoice.supplier_id == supplier.id,
            Invoice.invoice_number == inv_number
        ).first()

        if existing_invoice:
            doc.status = "completed"
            db.commit()
            return

        # Sample mock line data representing standard broadline food items
        mock_raw_lines = [
            {
                "line_index": 1,
                "raw_description": "Tomatoes, Roma 20lb CS",
                "supplier_sku": "SYS-10492",
                "quantity": 2.0,
                "pack_descriptor": "20lb",
                "unit_price": 38.50,
                "line_total": 77.00,
                "line_kind": "item",
            },
            {
                "line_index": 2,
                "raw_description": "Canola Oil 16L Pail",
                "supplier_sku": "SYS-50211",
                "quantity": 1.0,
                "pack_descriptor": "16L",
                "unit_price": 42.00,
                "line_total": 42.00,
                "line_kind": "item",
            },
            {
                "line_index": 3,
                "raw_description": "Fuel Surcharge",
                "supplier_sku": None,
                "quantity": 1.0,
                "pack_descriptor": "EA",
                "unit_price": 6.50,
                "line_total": 6.50,
                "line_kind": "fee",
            },
        ]

        subtotal = 125.50
        tax = 0.00  # Groceries zero-rated
        total = 125.50

        # 2. Arithmetic validation pass
        is_valid, validation_errors = validate_arithmetic(mock_raw_lines, subtotal, tax, total)
        validation_status = "passed" if is_valid else "review_needed"

        invoice = Invoice(
            document_id=doc.id,
            restaurant_id=doc.restaurant_id,
            supplier_id=supplier.id,
            invoice_number=inv_number,
            invoice_date=date.today(),
            subtotal=subtotal,
            tax=tax,
            total=total,
            extraction_provider="mock_v1",
            extraction_version="1.0",
            validation_status=validation_status,
        )
        db.add(invoice)
        db.flush()

        # If arithmetic failed, add a review item for human inspection
        if not is_valid:
            db.add(ReviewItem(
                kind="extraction",
                invoice_id=invoice.id,
                payload={"errors": validation_errors},
                status="pending"
            ))

        # Get restaurant for geom benchmarking
        restaurant = db.query(Restaurant).filter(Restaurant.id == doc.restaurant_id).first()

        # 3. Normalization and Unit Economics
        for raw in mock_raw_lines:
            units, size, measure = parse_pack_descriptor(raw.get("pack_descriptor"))
            line_kind = raw.get("line_kind", "item")

            canonical_id = None
            price_per_base = None

            # Normalization lookup in sku_mappings cache
            if raw.get("supplier_sku") and line_kind == "item":
                cached = db.query(SkuMapping).filter(
                    SkuMapping.supplier_id == supplier.id,
                    SkuMapping.supplier_sku == raw["supplier_sku"]
                ).first()

                if cached:
                    canonical_id = cached.canonical_item_id
                    c_item = db.query(CanonicalItem).filter(CanonicalItem.id == canonical_id).first()
                    if c_item and units and size:
                        total_units = raw["quantity"] * units * convert_to_base_unit(size, measure, c_item.base_unit)
                        if total_units > 0:
                            price_per_base = round(raw["line_total"] / total_units, 4)

            line = InvoiceLine(
                invoice_id=invoice.id,
                line_index=raw["line_index"],
                raw_description=raw["raw_description"],
                supplier_sku=raw.get("supplier_sku"),
                quantity=raw["quantity"],
                pack_descriptor=raw.get("pack_descriptor"),
                unit_price=raw["unit_price"],
                line_total=raw["line_total"],
                line_kind=line_kind,
                canonical_item_id=canonical_id,
                pack_units=units,
                pack_size=size,
                pack_measure=measure,
                price_per_base_unit=price_per_base,
            )
            db.add(line)
            db.flush()

            # If item is not mapped yet, route to review queue (keyboard-first navigation)
            if line_kind == "item" and not canonical_id:
                db.add(ReviewItem(
                    kind="mapping",
                    invoice_id=invoice.id,
                    invoice_line_id=line.id,
                    payload={
                        "raw_description": raw["raw_description"],
                        "supplier_sku": raw.get("supplier_sku"),
                        "pack_descriptor": raw.get("pack_descriptor"),
                        "supplier_name": supplier.canonical_name,
                    },
                    status="pending"
                ))

            # If benchmarkable and mapped, materialize observation
            if canonical_id and price_per_base and restaurant and restaurant.geom:
                obs = BenchmarkObservation(
                    restaurant_id=restaurant.id,
                    canonical_item_id=canonical_id,
                    supplier_id=supplier.id,
                    observed_on=invoice.invoice_date,
                    price_per_base_unit=price_per_base,
                    geom=restaurant.geom,
                )
                db.add(obs)

        doc.status = "completed"
        db.commit()

    except Exception as e:
        db.rollback()
        doc.status = "failed"
        db.commit()
        raise e
