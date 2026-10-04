import uuid
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Header
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

try:
    from ..database import get_db, SessionLocal
    from ..models import Document, Invoice, InvoiceLine, Restaurant, ReviewItem
    from ..schemas import InvoiceUploadResponse, InvoiceSummaryOut, InvoiceDetailOut, InvoiceLineOut
    from ..services.pipeline import compute_sha256, process_invoice_document
except (ImportError, ValueError):
    from database import get_db, SessionLocal
    from models import Document, Invoice, InvoiceLine, Restaurant, ReviewItem
    from schemas import InvoiceUploadResponse, InvoiceSummaryOut, InvoiceDetailOut, InvoiceLineOut
    from services.pipeline import compute_sha256, process_invoice_document

router = APIRouter(prefix="/invoices", tags=["Invoices"])

UPLOAD_STORAGE_DIR = os.getenv("UPLOAD_STORAGE_DIR", "/tmp/sous_uploads")
os.makedirs(UPLOAD_STORAGE_DIR, exist_ok=True)


def get_current_restaurant_id(x_restaurant_id: Optional[str] = Header(None), db: Session = Depends(get_db)) -> uuid.UUID:
    """Helper to get current restaurant id for multi-tenancy. Falls back to first restaurant in dev."""
    if x_restaurant_id:
        try:
            return uuid.UUID(x_restaurant_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Restaurant-ID header")

    # In dev/mock mode, default to the first restaurant in the database or generate one
    first_restaurant = db.query(Restaurant).first()
    if first_restaurant:
        return first_restaurant.id

    # Create a default test restaurant if none exists
    new_rest = Restaurant(
        name="Pilot Pizzeria GTA",
        address="123 Queen St W, Toronto, ON",
        seats=45,
        cuisine_type="Pizzeria"
    )
    db.add(new_rest)
    db.commit()
    db.refresh(new_rest)
    return new_rest.id


def run_pipeline_task(document_id: uuid.UUID):
    """Background task runner that manages its own DB session."""
    db = SessionLocal()
    try:
        process_invoice_document(db, document_id)
    finally:
        db.close()


@router.post("/upload", response_model=InvoiceUploadResponse)
async def upload_invoice(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db),
):
    """
    Ingest invoice file (PDF/JPG/PNG/HEIC).
    Checks SHA-256 for duplicate detection, stores file immutably, and triggers async pipeline.
    """
    allowed_mimes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "application/octet-stream"
    ]
    if file.content_type not in allowed_mimes and not file.filename.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png', '.heic')):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, JPG, PNG, or HEIC.")

    content = await file.read()
    content_sha256 = compute_sha256(content)

    # 1. Content Hash Duplicate Detection
    existing_doc = db.query(Document).filter(Document.content_sha256 == content_sha256).first()
    if existing_doc:
        existing_invoice = db.query(Invoice).filter(Invoice.document_id == existing_doc.id).first()
        # If invoice was deleted in DB or extracted with prototype mock_v1, re-trigger extraction
        if not existing_invoice or existing_invoice.extraction_provider == "mock_v1":
            if existing_invoice:
                db.delete(existing_invoice)
                db.commit()
            existing_doc.status = "pending"
            db.commit()
            background_tasks.add_task(run_pipeline_task, existing_doc.id)
            return InvoiceUploadResponse(
                document_id=existing_doc.id,
                content_sha256=content_sha256,
                status="pending",
                message="Reprocessing document extraction with PDF stream parser."
            )

        return InvoiceUploadResponse(
            document_id=existing_doc.id,
            content_sha256=content_sha256,
            status=existing_doc.status,
            message="Duplicate document detected. Using existing record."
        )

    # 2. Immutable storage
    filename = f"{content_sha256}_{file.filename}"
    file_path = os.path.join(UPLOAD_STORAGE_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(content)

    # 3. Create document record
    doc = Document(
        restaurant_id=restaurant_id,
        storage_key=file_path,
        content_sha256=content_sha256,
        mime=file.content_type or "application/pdf",
        source_channel="web_upload",
        status="pending"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 4. Trigger async extraction pipeline via BackgroundTasks
    background_tasks.add_task(run_pipeline_task, doc.id)

    return InvoiceUploadResponse(
        document_id=doc.id,
        content_sha256=content_sha256,
        status="pending",
        message="Invoice uploaded successfully. Extraction running in background."
    )


@router.get("", response_model=List[InvoiceSummaryOut])
def list_invoices(
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """List all invoices for the authenticated restaurant."""
    invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.document), joinedload(Invoice.supplier))
        .filter(Invoice.restaurant_id == restaurant_id)
        .order_by(Invoice.invoice_date.desc())
        .all()
    )
    return invoices


@router.get("/{invoice_id}", response_model=InvoiceDetailOut)
def get_invoice_detail(
    invoice_id: uuid.UUID,
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """Retrieve full invoice details with lines and validation status."""
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.document), joinedload(Invoice.supplier), joinedload(Invoice.lines))
        .filter(
            Invoice.id == invoice_id,
            Invoice.restaurant_id == restaurant_id
        )
        .first()
    )

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return invoice


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: uuid.UUID,
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Delete an invoice and its associated document record (resetting duplicate SHA-256 detection).
    Also cleans up associated review items.
    """
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.restaurant_id == restaurant_id
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    document_id = invoice.document_id

    # 1. Clean up review items pointing to this invoice
    db.query(ReviewItem).filter(ReviewItem.invoice_id == invoice.id).delete(synchronize_session=False)

    # 2. Delete invoice (cascade deletes lines)
    db.delete(invoice)
    db.flush()

    # 3. Clean up associated Document to reset SHA-256 duplicate cache
    if document_id:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            if doc.storage_key and os.path.exists(doc.storage_key):
                try:
                    os.remove(doc.storage_key)
                except Exception:
                    pass
            db.delete(doc)

    db.commit()
    return {"success": True, "message": "Invoice and document record deleted successfully."}
