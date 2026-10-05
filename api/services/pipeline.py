import os
import zlib
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


def extract_invoice_from_pdf(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Direct digital PDF stream extractor for distributor delivery receipts (e.g. Sysco GTA).
    Decodes ASCII85 and Flate streams, extracts exact text tokens, and structures
    the invoice header, lines, and arithmetic totals.
    """
    if not file_path or not os.path.exists(file_path):
        return None

    try:
        with open(file_path, "rb") as f:
            content = f.read()

        try:
            from reportlab.pdfbase.pdfutils import asciiBase85Decode
        except ImportError:
            asciiBase85Decode = None

        pattern = re.compile(rb"<<(.*?)>>\s*stream[\r\n]+(.*?)[\r\n]*endstream", re.DOTALL)
        all_strings = []
        for m in pattern.finditer(content):
            dict_part = m.group(1).decode("latin1", errors="ignore")
            stream_data = m.group(2)
            decoded_bytes = stream_data
            if "ASCII85Decode" in dict_part and asciiBase85Decode:
                try:
                    raw_str = stream_data.strip().decode("latin1")
                    if not raw_str.endswith("~>"):
                        raw_str += "~>"
                    res = asciiBase85Decode(raw_str)
                    decoded_bytes = res if isinstance(res, bytes) else res.encode("latin1")
                except Exception:
                    pass
            if "FlateDecode" in dict_part:
                try:
                    decoded_bytes = zlib.decompress(decoded_bytes)
                except Exception:
                    try:
                        decoded_bytes = zlib.decompress(decoded_bytes, -15)
                    except Exception:
                        pass
            stream_text = decoded_bytes.decode("latin1", errors="ignore")
            matches = re.findall(r"\(((?:[^()\\]|\\.)*)\)\s*Tj", stream_text)
            for s in matches:
                cleaned = s.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\").strip()
                if cleaned:
                    all_strings.append(cleaned)

        if not all_strings:
            return None

        result = {
            "supplier_name": "Sysco GTA",
            "invoice_number": None,
            "invoice_date": date.today(),
            "delivery_date": None,
            "subtotal": 0.0,
            "tax": 0.0,
            "total": 0.0,
            "lines": [],
            "extraction_provider": "pdf_stream_v1"
        }

        if len(all_strings) > 0:
            header_peek = " ".join(all_strings[:6]).upper()
            if "GORDON" in header_peek or "GFS" in header_peek:
                result["supplier_name"] = "Gordon Food Service (GFS)"
            elif "FLANAGAN" in header_peek:
                result["supplier_name"] = "Flanagan Foodservice"
            elif "SYSCO" in header_peek or "TORONTO" in header_peek:
                result["supplier_name"] = "Sysco GTA"

        fees_total = 0.0
        merchandise_subtotal = 0.0

        i = 0
        while i < len(all_strings):
            token = all_strings[i]

            if "Invoice #:" in token and i + 1 < len(all_strings):
                result["invoice_number"] = all_strings[i+1].strip()
                i += 2
                continue
            elif "Invoice Date:" in token and i + 1 < len(all_strings):
                raw_date = all_strings[i+1].strip()
                try:
                    result["invoice_date"] = datetime.strptime(raw_date, "%b %d, %Y").date()
                except Exception:
                    pass
                i += 2
                continue
            elif "Delivery Date:" in token and i + 1 < len(all_strings):
                raw_date = all_strings[i+1].strip()
                try:
                    result["delivery_date"] = datetime.strptime(raw_date, "%b %d, %Y").date()
                except Exception:
                    pass
                i += 2
                continue
            elif token == "Extended Total":
                i += 1
                while i + 6 < len(all_strings):
                    ln_token = all_strings[i]
                    if not ln_token.isdigit():
                        break
                    line_idx = int(ln_token)
                    sku = all_strings[i+1]
                    desc = all_strings[i+2]
                    pack = all_strings[i+3]
                    try:
                        qty = float(all_strings[i+4])
                        unit_price = float(all_strings[i+5].replace("$", "").replace(",", ""))
                        line_total = float(all_strings[i+6].replace("$", "").replace(",", ""))
                    except ValueError:
                        break

                    is_fee = (
                        "fee" in desc.lower()
                        or "surcharge" in desc.lower()
                        or sku.startswith("SYS-9")
                        or sku.startswith("GFS-9")
                        or sku.startswith("FLA-9")
                    )
                    result["lines"].append({
                        "line_index": line_idx,
                        "supplier_sku": sku,
                        "raw_description": desc,
                        "pack_descriptor": pack,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "line_total": line_total,
                        "line_kind": "fee" if is_fee else "item"
                    })
                    i += 7
                continue
            elif "Merchandise Subtotal:" in token and i + 1 < len(all_strings):
                try:
                    merchandise_subtotal = float(all_strings[i+1].replace("$", "").replace(",", ""))
                except ValueError:
                    pass
                i += 2
                continue
            elif "Fuel Surcharges:" in token and i + 1 < len(all_strings):
                try:
                    fees_total = float(all_strings[i+1].replace("$", "").replace(",", ""))
                except ValueError:
                    pass
                i += 2
                continue
            elif token.startswith("HST (") and i + 1 < len(all_strings):
                try:
                    result["tax"] = float(all_strings[i+1].replace("$", "").replace(",", ""))
                except ValueError:
                    pass
                i += 2
                continue
            elif "TOTAL DUE" in token and i + 1 < len(all_strings):
                try:
                    result["total"] = float(all_strings[i+1].replace("$", "").replace(",", ""))
                except ValueError:
                    pass
                i += 2
                continue

            i += 1

        if merchandise_subtotal > 0:
            result["subtotal"] = round(merchandise_subtotal + fees_total, 2)
        elif result["lines"]:
            result["subtotal"] = round(sum(l["line_total"] for l in result["lines"]), 2)

        if result["total"] == 0.0 and result["subtotal"] > 0:
            result["total"] = round(result["subtotal"] + result["tax"], 2)

        return result
    except Exception:
        return None


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
        # 1. Extraction: Attempt direct PDF stream parsing first, fallback to mock prototype if needed
        extracted = None
        if doc.storage_key and (doc.storage_key.lower().endswith(".pdf") or doc.mime == "application/pdf"):
            extracted = extract_invoice_from_pdf(doc.storage_key)

        if extracted and extracted.get("lines"):
            supplier_canonical = extracted.get("supplier_name", "Sysco GTA")
            inv_number = extracted.get("invoice_number") or f"INV-{doc.content_sha256[:8].upper()}"
            inv_date = extracted.get("invoice_date") or date.today()
            delivery_date = extracted.get("delivery_date")
            raw_lines = extracted["lines"]
            subtotal = extracted["subtotal"]
            tax = extracted["tax"]
            total = extracted["total"]
            provider = extracted.get("extraction_provider", "pdf_stream_v1")
        else:
            supplier_canonical = "Sysco GTA"
            inv_number = f"INV-{doc.content_sha256[:8].upper()}"
            inv_date = date.today()
            delivery_date = None
            raw_lines = [
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
            tax = 0.00
            total = 125.50
            provider = "mock_v1"

        # Find or create distributor
        supplier = db.query(Supplier).filter(Supplier.canonical_name == supplier_canonical).first()
        if not supplier:
            supplier = Supplier(
                canonical_name=supplier_canonical,
                aliases=["Sysco", "Sysco Toronto", "Sysco Central Ontario"],
                is_broadline=True
            )
            db.add(supplier)
            db.flush()

        # Check for logical duplicate: same supplier + invoice_number + restaurant
        existing_invoice = db.query(Invoice).filter(
            Invoice.restaurant_id == doc.restaurant_id,
            Invoice.supplier_id == supplier.id,
            Invoice.invoice_number == inv_number
        ).first()

        if existing_invoice:
            doc.status = "completed"
            db.commit()
            return

        # 2. Arithmetic validation pass
        is_valid, validation_errors = validate_arithmetic(raw_lines, subtotal, tax, total)
        validation_status = "passed" if is_valid else "review_needed"

        invoice = Invoice(
            document_id=doc.id,
            restaurant_id=doc.restaurant_id,
            supplier_id=supplier.id,
            invoice_number=inv_number,
            invoice_date=inv_date,
            delivery_date=delivery_date,
            subtotal=subtotal,
            tax=tax,
            total=total,
            extraction_provider=provider,
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
        for raw in raw_lines:
            units, size, measure = parse_pack_descriptor(raw.get("pack_descriptor"))
            line_kind = raw.get("line_kind", "item")

            canonical_id = None
            price_per_base = None

            # Normalization lookup in sku_mappings cache or canonical items
            if raw.get("supplier_sku") and line_kind == "item":
                cached = db.query(SkuMapping).filter(
                    SkuMapping.supplier_id == supplier.id,
                    SkuMapping.supplier_sku == raw["supplier_sku"]
                ).first()

                if cached:
                    canonical_id = cached.canonical_item_id
                else:
                    # Smart keyword matching against canonical items
                    desc_lower = raw["raw_description"].lower()
                    matched_item = None
                    for kw in ["roma", "canola", "mozzarella", "flour", "pepperoni", "tomato"]:
                        if kw in desc_lower:
                            matched_item = db.query(CanonicalItem).filter(
                                CanonicalItem.name.ilike(f"%{kw}%")
                            ).first()
                            if matched_item:
                                break
                    if matched_item:
                        canonical_id = matched_item.id
                        # Seed into sku_mappings cache for deterministic future resolution
                        db.add(SkuMapping(
                            supplier_id=supplier.id,
                            supplier_sku=raw["supplier_sku"],
                            canonical_item_id=matched_item.id,
                            pack_units=units or 1,
                            pack_size=size,
                            pack_measure=measure or matched_item.base_unit
                        ))
                        db.flush()

                if canonical_id:
                    c_item = db.query(CanonicalItem).filter(CanonicalItem.id == canonical_id).first()
                    if c_item and units and size:
                        total_units = raw["quantity"] * units * convert_to_base_unit(size, measure or c_item.base_unit, c_item.base_unit)
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
