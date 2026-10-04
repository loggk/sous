import uuid
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from geoalchemy2 import Geography
from pgvector.sqlalchemy import Vector

try:
    from .database import Base
except (ImportError, ValueError):
    from database import Base


class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    geom = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    seats: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cuisine_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="restaurant", cascade="all, delete-orphan")
    documents: Mapped[List["Document"]] = relationship("Document", back_populates="restaurant", cascade="all, delete-orphan")
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="restaurant", cascade="all, delete-orphan")
    benchmark_observations: Mapped[List["BenchmarkObservation"]] = relationship(
        "BenchmarkObservation", back_populates="restaurant", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner | manager | member

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="users")


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    aliases: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), default=list)
    is_broadline: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="supplier")
    sku_mappings: Mapped[List["SkuMapping"]] = relationship("SkuMapping", back_populates="supplier")
    benchmark_observations: Mapped[List["BenchmarkObservation"]] = relationship(
        "BenchmarkObservation", back_populates="supplier"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    mime: Mapped[str] = mapped_column(String(100), nullable=False)
    source_channel: Mapped[str] = mapped_column(String(50), default="web_upload")  # web_upload | email | mobile
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | processing | completed | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="documents")
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="document", cascade="all, delete-orphan")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    subtotal: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    tax: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    extraction_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    extraction_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | passed | failed | review_needed
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("restaurant_id", "supplier_id", "invoice_number", name="uq_restaurant_supplier_invoice"),
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="invoices")
    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="invoices")
    supplier: Mapped["Supplier"] = relationship("Supplier", back_populates="invoices")
    lines: Mapped[List["InvoiceLine"]] = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")

    @property
    def file_name(self) -> Optional[str]:
        if self.document and self.document.storage_key:
            import os
            basename = os.path.basename(self.document.storage_key)
            if "_" in basename:
                parts = basename.split("_", 1)
                return parts[1]
            return f"{self.invoice_number}.pdf"
        return f"{self.invoice_number}.pdf"

    @property
    def supplier_name(self) -> Optional[str]:
        if self.supplier:
            return self.supplier.canonical_name
        return None


class CanonicalItem(Base):
    __tablename__ = "canonical_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # produce | dairy | dry_goods | proteins | etc.
    base_unit: Mapped[str] = mapped_column(String(20), nullable=False)  # kg | L | each
    benchmarkable: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    embedding = mapped_column(Vector(768), nullable=True)

    # Relationships
    aliases: Mapped[List["CanonicalItemAlias"]] = relationship("CanonicalItemAlias", back_populates="canonical_item", cascade="all, delete-orphan")
    sku_mappings: Mapped[List["SkuMapping"]] = relationship("SkuMapping", back_populates="canonical_item")
    invoice_lines: Mapped[List["InvoiceLine"]] = relationship("InvoiceLine", back_populates="canonical_item")
    benchmark_observations: Mapped[List["BenchmarkObservation"]] = relationship(
        "BenchmarkObservation", back_populates="canonical_item"
    )


class CanonicalItemAlias(Base):
    __tablename__ = "canonical_item_aliases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False)
    alias: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), default="seed")  # seed | manual | inferred

    # Relationships
    canonical_item: Mapped["CanonicalItem"] = relationship("CanonicalItem", back_populates="aliases")


class SkuMapping(Base):
    __tablename__ = "sku_mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    supplier_sku: Mapped[str] = mapped_column(String(100), nullable=False)
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("canonical_items.id", ondelete="RESTRICT"), nullable=False)
    pack_units: Mapped[int] = mapped_column(Integer, default=1)
    pack_size: Mapped[Optional[float]] = mapped_column(Numeric(10, 4), nullable=True)
    pack_measure: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric(4, 3), nullable=True)
    confirmed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("supplier_id", "supplier_sku", name="uq_supplier_sku_mapping"),
    )

    # Relationships
    supplier: Mapped["Supplier"] = relationship("Supplier", back_populates="sku_mappings")
    canonical_item: Mapped["CanonicalItem"] = relationship("CanonicalItem", back_populates="sku_mappings")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_description: Mapped[str] = mapped_column(String(500), nullable=False)
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    pack_descriptor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_kind: Mapped[str] = mapped_column(String(20), default="item")  # item | credit | fee | tax | deposit
    catch_weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(10, 4), nullable=True)
    canonical_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_items.id", ondelete="SET NULL"), nullable=True
    )

    # Explicit packaging math
    pack_units: Mapped[int] = mapped_column(Integer, default=1)
    pack_size: Mapped[Optional[float]] = mapped_column(Numeric(10, 4), nullable=True)
    pack_measure: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    price_per_base_unit: Mapped[Optional[float]] = mapped_column(Numeric(10, 4), nullable=True)
    is_promotional: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric(4, 3), nullable=True)

    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="lines")
    canonical_item: Mapped[Optional["CanonicalItem"]] = relationship("CanonicalItem", back_populates="invoice_lines")


class ReviewItem(Base):
    __tablename__ = "review_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # extraction | mapping | pack_parse
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True)
    invoice_line_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("invoice_lines.id", ondelete="CASCADE"), nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending | in_review | resolved | dismissed
    assignee: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class BenchmarkObservation(Base):
    __tablename__ = "benchmark_observations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    canonical_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("canonical_items.id", ondelete="CASCADE"), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    observed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    price_per_base_unit: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    geom = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)

    __table_args__ = (
        Index("idx_benchmark_lookup", "canonical_item_id", "observed_on"),
    )

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="benchmark_observations")
    canonical_item: Mapped["CanonicalItem"] = relationship("CanonicalItem", back_populates="benchmark_observations")
    supplier: Mapped["Supplier"] = relationship("Supplier", back_populates="benchmark_observations")

