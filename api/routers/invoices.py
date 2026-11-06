import uuid
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Header
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

try:
    from ..database import get_db, SessionLocal
    from ..models import Document, Invoice, InvoiceLine, Restaurant, ReviewItem
    from ..schemas import InvoiceUploadResponse, InvoiceSummaryOut, InvoiceDetailOut, InvoiceLineOut
    from ..services.pipeline import compute_sha256, process_invoice_document
    from ..services.storage import (
        upload_invoice_file,
        get_invoice_signed_url,
        delete_invoice_file,
        get_local_file_path,
    )
except (ImportError, ValueError):
    from database import get_db, SessionLocal
    from models import Document, Invoice, InvoiceLine, Restaurant, ReviewItem
    from schemas import InvoiceUploadResponse, InvoiceSummaryOut, InvoiceDetailOut, InvoiceLineOut
    from services.pipeline import compute_sha256, process_invoice_document
    from services.storage import (
        upload_invoice_file,
        get_invoice_signed_url,
        delete_invoice_file,
        get_local_file_path,
    )

router = APIRouter(prefix="/invoices", tags=["Invoices"])

UPLOAD_STORAGE_DIR = os.getenv("UPLOAD_STORAGE_DIR", "/tmp/sous_uploads")
os.makedirs(UPLOAD_STORAGE_DIR, exist_ok=True)


try:
    from ..auth import get_current_restaurant_id, get_current_user
except (ImportError, ValueError):
    from auth import get_current_restaurant_id, get_current_user
    
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

    # 2. Immutable storage (Supabase S3 + local cache)
    storage_key, _ = upload_invoice_file(
        content=content,
        restaurant_id=str(restaurant_id),
        content_sha256=content_sha256,
        original_filename=file.filename or "invoice.pdf",
        mime=file.content_type or "application/pdf"
    )

    # 3. Create document record
    doc = Document(
        restaurant_id=restaurant_id,
        storage_key=storage_key,
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
    result = []
    for inv in invoices:
        item = InvoiceSummaryOut.model_validate(inv)
        item.pdf_url = f"/invoices/{inv.id}/pdf"
        result.append(item)
    return result


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

    res = InvoiceDetailOut.model_validate(invoice)
    res.pdf_url = f"/invoices/{invoice.id}/pdf"
    return res


@router.get("/{invoice_id}/pdf")
def view_invoice_pdf(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Open or stream the original uploaded PDF invoice.
    1. If stored in Supabase Storage, redirects (307) to a secure time-limited presigned URL.
    2. If stored on local disk, streams the file directly with FileResponse.
    3. If neither exists (mock/seeded invoice or missing scan), dynamically generates a broadline PDF invoice.
    """
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.document),
            joinedload(Invoice.supplier),
            joinedload(Invoice.restaurant),
            joinedload(Invoice.lines)
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    storage_key = invoice.document.storage_key if invoice.document else None
    content_sha = invoice.document.content_sha256 if invoice.document else None

    # 1. Supabase Storage Signed URL
    if storage_key and storage_key.startswith("supabase://"):
        signed_url = get_invoice_signed_url(storage_key, expires_in=3600)
        if signed_url:
            return RedirectResponse(url=signed_url, status_code=307)

    # 2. Local File / Cache fallback
    if storage_key and content_sha:
        local_path = get_local_file_path(storage_key, content_sha)
        if local_path and os.path.exists(local_path):
            return FileResponse(
                local_path,
                media_type=(invoice.document.mime if invoice.document else None) or "application/pdf",
                filename=invoice.file_name or f"{invoice.invoice_number}.pdf",
                content_disposition_type="inline"
            )

    # 3. Dynamic synthesis fallback (for mock/seed invoices or missing scans)
    try:
        from ..services.pdf_generator import generate_invoice_pdf
    except (ImportError, ValueError):
        from services.pdf_generator import generate_invoice_pdf

    pdf_bytes = generate_invoice_pdf(invoice)

    # Cache locally so subsequent loads are instant
    cached_path = os.path.join(UPLOAD_STORAGE_DIR, f"{invoice.id}.pdf")
    try:
        with open(cached_path, "wb") as f:
            f.write(pdf_bytes)
    except Exception:
        pass

    from fastapi.responses import Response
    filename = invoice.file_name or f"{invoice.invoice_number or 'invoice'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={filename}",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.get("/{invoice_id}/pdf-url")
def get_invoice_pdf_url_endpoint(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Returns the secure direct URL to view the invoice PDF in the browser or an iframe.
    """
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.document))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice or document not found")

    storage_key = invoice.document.storage_key if invoice.document else None
    signed_url = None
    if storage_key and storage_key.startswith("supabase://"):
        signed_url = get_invoice_signed_url(storage_key, expires_in=3600)

    view_url = signed_url or f"/invoices/{invoice_id}/pdf"
    return {
        "invoice_id": str(invoice_id),
        "url": view_url,
        "is_signed_url": bool(signed_url),
        "file_name": invoice.file_name or f"{invoice.invoice_number}.pdf"
    }


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: uuid.UUID,
    restaurant_id: uuid.UUID = Depends(get_current_restaurant_id),
    db: Session = Depends(get_db)
):
    """
    Delete an invoice and its associated document record (resetting duplicate SHA-256 detection).
    Also cleans up associated review items and Supabase storage files.
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

    # 3. Clean up associated Document and file storage
    if document_id:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            if doc.storage_key:
                delete_invoice_file(doc.storage_key)
            db.delete(doc)

    db.commit()
    return {"success": True, "message": "Invoice and document record deleted successfully."}
