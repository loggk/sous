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
    pdf_url: Optional[str] = None


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
    selected_radius_km: Optional[int] = None
    window_start: Optional[date] = None
    window_end: Optional[date] = None
    suppressed: bool
    suppression_reason: Optional[str] = None
    tenant_latest_price: Optional[float] = None
    comparability_caveat: str = (
        "Prices reflect gross invoiced amounts and do not account for off-invoice "
        "quarterly rebates, contract tiers, or prompt-payment discounts."
    )


class BenchmarkSummaryItem(BaseModel):
    id: UUID
    name: str
    category: str
    base_unit: str
    has_data: bool
    suppressed: bool
    n_restaurants: int = 0
    radius_km_used: Optional[int] = None
    selected_radius_km: Optional[int] = None
    median: Optional[float] = None
    p25: Optional[float] = None
    p75: Optional[float] = None


class CanonicalItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str
    base_unit: str
    benchmarkable: bool


class TopCostItemOut(BaseModel):
    id: Optional[UUID] = None
    name: str
    category: str
    base_unit: str
    total_spend: float
    total_qty: float
    avg_price: float
    pct_of_spend: float


class SpendSummaryOut(BaseModel):
    total_spend: float
    by_category: Dict[str, float]
    by_supplier: Dict[str, float]
    fees_total: float
    top_items: List[TopCostItemOut] = []


class RestaurantSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    address: Optional[str] = None
    seats: Optional[int] = None
    cuisine_type: Optional[str] = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    restaurants: List[RestaurantSummaryOut] = []
    assigned_restaurant_ids: List[UUID] = []
    is_owner: bool = True
    user_role: str = "owner"


class CompanyRegisterRequest(BaseModel):
    company_name: str
    restaurant_name: str
    address: Optional[str] = None
    cuisine_type: Optional[str] = None
    admin_email: str


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    assigned_restaurant_ids: List[UUID] = []
    assigned_restaurants: List[RestaurantSummaryOut] = []


class TeamInvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    restaurant_ids: List[UUID] = []
    created_at: datetime


class InviteTeamMemberRequest(BaseModel):
    email: str
    restaurant_ids: List[UUID]


class AcceptInviteRequest(BaseModel):
    email: str
    password: str


class UpdateUserAssignmentsRequest(BaseModel):
    restaurant_ids: List[UUID]


class AddLocationRequest(BaseModel):
    name: str
    address: Optional[str] = None
    cuisine_type: Optional[str] = None


