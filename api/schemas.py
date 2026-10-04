from datetime import date, datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class InvoiceUploadResponse(BaseModel):
    document_id: UUID
    content_sha256: str
    status: str
    message: str


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    line_index: int
    raw_description: str
    supplier_sku: Optional[str] = None
    quantity: float
    pack_descriptor: Optional[str] = None
    unit_price: float
    line_total: float
    line_kind: str
    catch_weight_kg: Optional[float] = None
    canonical_item_id: Optional[UUID] = None
    pack_units: int = 1
    pack_size: Optional[float] = None
    pack_measure: Optional[str] = None
    price_per_base_unit: Optional[float] = None
    is_promotional: bool = False
    confidence: Optional[float] = None


class InvoiceSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_number: str
    file_name: Optional[str] = None
    invoice_date: date
    supplier_id: UUID
    supplier_name: Optional[str] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total: float
    validation_status: str


class InvoiceDetailOut(InvoiceSummaryOut):
    delivery_date: Optional[date] = None
    extraction_provider: Optional[str] = None
    lines: List[InvoiceLineOut] = []


class ReviewItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str  # extraction | mapping | pack_parse
    invoice_id: Optional[UUID] = None
    invoice_line_id: Optional[UUID] = None
    status: str
    payload: Optional[Dict[str, Any]] = None


class ResolveReviewRequest(BaseModel):
    canonical_item_id: UUID
    pack_units: int = 1
    pack_size: Optional[float] = None
    pack_measure: Optional[str] = None
    update_sku_cache: bool = True


class BenchmarkResponse(BaseModel):
    canonical_item_id: UUID
    canonical_item_name: Optional[str] = None
    base_unit: Optional[str] = None
    p25: Optional[float] = None
    median: Optional[float] = None
    p75: Optional[float] = None
    n_restaurants: int
    radius_km_used: Optional[int] = None
    window_start: Optional[date] = None
    window_end: Optional[date] = None
    suppressed: bool
    suppression_reason: Optional[str] = None
    tenant_latest_price: Optional[float] = None
    comparability_caveat: str = (
        "Prices reflect gross invoiced amounts and do not account for off-invoice "
        "quarterly rebates, contract tiers, or prompt-payment discounts."
    )


class CanonicalItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str
    base_unit: str
    benchmarkable: bool


class SpendSummaryOut(BaseModel):
    total_spend: float
    by_category: Dict[str, float]
    by_supplier: Dict[str, float]
    fees_total: float
