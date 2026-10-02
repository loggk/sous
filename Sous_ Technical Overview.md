# **Sous: Technical Overview v3**

**Author:** Logan Kennedy  
**Date:** October 2, 2026  
**Status:** Prototype specification  
---

# **1\. Core Concept**

Sous is a restaurant cost-intelligence platform for independent operators. It ingests supplier invoices, normalizes line items to comparable per-unit economics, audits the operator's own price history, and — the differentiator — benchmarks those normalized prices against an anonymized local cohort of participating restaurants.  
The audit layer is table stakes. Several AI invoice-auditing tools for independents already exist and the category is commoditizing. The defensible asset is the **local price network**. Therefore the prototype's objective is not to prove that OCR works; it is to prove that a normalized, anonymous, credible local benchmark can be produced from real GTA invoices.  
**Initial market:** A targeted micro-vertical (e.g., 12–15 pizzerias or burger/sandwich shops) in a concentrated Greater Toronto Area corridor. Narrowing the initial focus guarantees overlapping commodity SKUs, overcoming the k-anonymity density threshold to ensure the benchmark screens are active rather than suppressed.  
---

# **2\. Thesis to Validate**

*\> A normalized, k-anonymous local benchmark can be produced from real GTA supplier invoices, and an operator finds it credible enough to act on.*  
Everything in the prototype scope serves this. Everything else is deferred.  
---

# **3\. Functional Requirements**

## **3.1 Invoice Ingestion**

Simplified for v1 prototype:  
**1\. Web upload** — drag-and-drop PDF / JPG / PNG / HEIC, multi-file, multi-page.  
*\*(Inbound email and mobile photo capture are explicitly out of scope for the v1 prototype to reduce complexity and allow the solo developer to focus on the core app functionality.)\**  
Requirements for ingestion:  
Store the original file immutably in object storage; never mutate source documents.  
Compute a content hash (SHA-256) on ingest for **duplicate detection**. Re-uploads of the same invoice are common and must not double-count into benchmarks.  
Also detect *logical* duplicates: same supplier \+ same invoice number \+ same tenant, even if the file differs (photo vs. PDF of the same invoice).  
Processing is asynchronous. Extraction takes 5–60s per document and must never run in the HTTP request cycle.  
Every job is idempotent and retryable with exponential backoff; terminal failures surface in an internal queue, not silently.  
**Initial Testing:** The developer will use mock data to build and test the functional application until the team sources real pilot invoices.

## **3.2 Extraction**

Pluggable provider interface — do **not** hard-commit to a vendor in the spec.

```py
class ExtractionProvider(Protocol):
    def extract(self, document: bytes, mime: str) -> ExtractionResult: ...
```

Target extraction schema per invoice: supplier name, invoice number, invoice date, delivery date, subtotal, tax, total, and per line: raw description, supplier SKU, quantity, unit/pack descriptor, unit price, line total.  
**Arithmetic validation pass (mandatory).** After extraction, verify:  
sum(line\_totals) \+ tax \+ fees ≈ invoice\_total within tolerance.  
quantity × unit\_price ≈ line\_total per line.  
Invoices failing validation route to human review rather than into the dataset. This single check catches the majority of extraction errors at near-zero cost and is the cheapest quality lever in the system.

## **3.3 Normalization**

Normalization is a **human-in-the-loop workflow with a persistent cache**, not a transformation algorithm. This is the most commonly underestimated component.  
**Mapping model:** (supplier\_id, supplier\_sku) → canonical\_item\_id, resolved **once** and persisted. Never re-infer a mapping that already exists. Because the same broadline distributors ship the same SKUs to every restaurant in the GTA, the cache does the overwhelming majority of the work after the first few hundred mappings.  
**Resolution pipeline:**  
Exact lookup on (supplier\_id, supplier\_sku) → done.  
Candidate generation: pg\_trgm trigram similarity on the raw description \+ pgvector embedding nearest-neighbour over canonical item names and known aliases.  
Auto-accept above a high confidence threshold (tune on labelled data; start conservative).  
Everything else → internal **mapping review queue**. **Must feature keyboard-first navigation** (e.g., tab to advance, enter to accept, single-key reject) to prevent a UI bottleneck during the initial manual mapping phase.  
**Canonical catalogue:** seed 100–150 items covering roughly 80% of independent-restaurant spend (produce, dairy, dry goods, oils, basic proteins). Each canonical item carries a base unit of measure (kg, L, each) and a benchmarkable flag. **Do not attempt to build a universal ingredient taxonomy.**

## **3.4 Unit Economics (the actual engine)**

Benchmarking is impossible without a correct price-per-base-unit computation:

```
price_per_base_unit =
    line_total
    / (quantity × pack_units × pack_size)
```

This requires a **pack descriptor parser** handling at minimum: 20lb, 20\#, 6/4L, 2x5kg, CS/24, 24/500ml, EA, BU, CT. Expect a long tail; unparseable descriptors route to review.  
Edge cases that must be modelled explicitly:  
**Catch-weight items** — variable-weight proteins where invoiced weight ≠ ordered quantity. Requires a separate weight field; price per kg is derived from actual invoiced weight.  
**Credits and returns** — negative lines. Must not be averaged into price benchmarks.  
**Non-item lines** — fuel surcharge, delivery fee, handling, bottle deposits, tax. Excluded from item benchmarks, tracked separately as a fee-audit surface (a real source of overcharge in its own right).  
**Promotional / one-off pricing** — flag and optionally exclude from benchmark contribution.

## **3.5 Internal Audit Dashboard**

Per-tenant, no cross-tenant data:  
Price history per canonical item, in price-per-base-unit, with supplier attribution.  
Spend breakdown by category and by supplier.  
Fee and surcharge tracking over time.  
Price-change alerts (see 3.6).

## **3.6 Price-Change Alerting**

A flat percentage threshold will fire constantly on seasonal produce and train users to ignore notifications. Required approach:  
Per-item baseline \= trailing median price-per-base-unit over a rolling window.  
Flag deviation relative to that baseline, with a minimum absolute-dollar-impact floor so trivial items don't generate noise.  
**Cohort comparison — the valuable part.** Classify each flagged change as:  
**Market-wide** — the local cohort moved similarly. Informational; no dispute warranted.  
**Supplier-specific to you** — the cohort did not move. Actionable; this is the dispute trigger.  
This classification is the technical expression of the "act with context" promise and is precisely what audit-only competitors structurally cannot do without a network.

## **3.7 Geospatial Benchmarking**

**Anonymity is a hard requirement enforced in the database, not a frontend concern.** "Stripping identifying business information" is insufficient — min/max values, small cells, narrow filters, and repeated queries over time all leak individual prices.  
**Enforced rules (single SQL function; every read path goes through it):**  
Minimum **5 distinct contributing restaurants** per cell.  
Minimum **15 observations** per cell.  
No single restaurant contributing more than **30%** of observations in a cell.  
Return **p25 / median / p75 only**. Never min, max, count-of-one, or raw observations.  
**Fixed rolling windows** (e.g. trailing 30 / 90 days), server-defined. Users cannot choose arbitrary date ranges — arbitrary ranges enable differencing attacks.  
**Lag the data.** No live or current-week pricing. Trailing windows only.  
Suppress the cell entirely when thresholds fail. Never degrade gracefully into a smaller sample.  
Benchmarks restricted to benchmarkable \= true canonical items (commodity categories). Proteins and seafood are spec-dominated and excluded from benchmarking in v1 while still appearing in the personal audit view.  
**Adaptive geography (cold-start handling).** A fixed radius returns nothing at low density. Instead, expand the pool until thresholds are met and **label the result honestly**:

```
radius ladder: 3km → 7km → 15km → GTA-wide
```

Display: *"Median across 14 restaurants, GTA-wide, trailing 90 days."* Never silently widen the geography without telling the user.  
**Comparability caveats, surfaced in the UI.**  
Two restaurants legitimately pay different prices for identical SKUs due to volume tiers, delivery frequency, contract terms, rebates, and prompt-pay discounts.  
**Crucial UI addition:** The benchmark display must explicitly state that prices reflect *gross invoiced amounts* and do not account for off-invoice quarterly rebates or prompt-payment discounts. Present benchmarks as distributions with sample size and an explicit caveat. A bare "you are 18% above market" claim that a supplier rep can plausibly rebut will cause churn.  
**Contribute-to-consume entitlement.** Benchmark access is gated on the tenant having contributed a minimum volume of validated invoice data. This is both a growth mechanism and an authorization rule — build it into the API layer from day one.  
---

# **4\. Competition Law Posture**

Sous is a mechanism by which competing buyers see each other's input prices. Canadian guidance is favourable to this design *if implemented correctly*, and the design constraints are not onerous — but they are architectural, not cosmetic.  
The Competition Bureau's Competitor Collaboration Guidelines assess information sharing on: the sensitivity of the information, whether it is historical versus current or forward-looking, the market power of participants, and whether the information is aggregated by an **independent third party** rather than exchanged directly between competitors. The Bureau's own illustrative example describes members submitting historical cost data to a third party that returns it aggregated such that no individual member's data is identifiable, and concludes such an arrangement would not likely be challenged. The Bureau's trade-association guidance states the same operationally: use a third party, disseminate only aggregate information that cannot be attributed to any competitor, and do not coerce participation.  
**Design constraints that follow:**

| Constraint | Implementation |
| :---- | :---- |
| Sous is the independent third party | No peer-to-peer data visibility, ever |
| Historical only | Trailing windows with a lag; no live or forward pricing |
| Non-attributable aggregate | k-anonymity function in §3.7, enforced in SQL |
| No price coordination surface | No "recommended price," "target price," or negotiation-coordination features |
| Voluntary participation | Contribute-to-consume gating is an incentive, not a penalty; no disciplinary mechanism |
| Buy-side only | Benchmarks cover input purchase prices, never menu prices |

**Additional requirements:**  
**Data rights.** Terms of service must grant Sous an explicit licence to use de-identified invoice data for aggregate benchmarking. Without this the dataset is unusable.  
**Privacy.** Invoice data is primarily commercial, but invoices contain named contacts, delivery addresses, and signatures — PIPEDA-relevant personal information. De-identify on ingest into the benchmark pipeline; retain originals tenant-scoped.  
**Action item.** Obtain a written legal opinion before any public launch. This is also a genuine trust asset with early adopters and should be a named deliverable, not an afterthought.  
---

# **5\. Architecture**

```
Web upload (Next.js)     ─┼──► FastAPI ──► Object storage (S3/GCS)
                                   │
                      FastAPI BackgroundTasks
                   (Postgres status tracking)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
            ExtractionProvider  Validation   Normalization
            (DocAI / Textract   (arithmetic   (trgm + pgvector
             / vision LLM)       checks)       + review queue)
                    └──────────────┼──────────────┘
                                   ▼
                        PostgreSQL + PostGIS + pgvector
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            Tenant audit views          k-anonymous benchmark fn
                    └──────────────┬──────────────┘
                                   ▼
                        Next.js dashboard
```

## **5.1 Stack**

**Frontend** — Next.js (App Router) \+ Tailwind CSS. Treated as pure presentation; no business logic.  
**Backend** — Python / FastAPI. All business logic lives here. Python is the right choice for the parsing and statistics work.  
**Database** — PostgreSQL, with:  
**PostGIS** — geospatial cohort queries  
**pgvector** — item-matching embeddings  
**pg\_trgm** — fuzzy description matching  
**Row-level security** — tenant isolation enforced at the database, not just the ORM  
**Async** — FastAPI `BackgroundTasks` + Postgres `status` tracking for the prototype (zero extra infrastructure). Redis + Arq can be introduced later if distributed task workers or dedicated retry queues are required at scale.  
**Object storage** — S3 or GCS. Originals immutable.  
**Auth** — managed (Clerk or Supabase Auth). Do not hand-roll.  
**Observability** — Sentry for errors; structured logging with per-invoice trace IDs.  
**Hosting recommendation** — Supabase or Neon provides Postgres \+ PostGIS \+ pgvector \+ auth \+ storage in one place and saves roughly a week of setup. Vercel for the Next.js frontend; Fly.io or Railway for FastAPI.

## **5.2 Explicitly Out of Scope for v1**

POS integration, accounting integration (Xero/QBO), recipe costing, inventory management, native mobile apps, EDI / supplier-portal scraping, automated dispute-letter generation. All valuable. None needed to validate the thesis.  
---

# **6\. Data Model (initial)**

```sql
-- Tenancy
restaurants (
  id, name, address, geom GEOGRAPHY(POINT, 4326),
  seats, cuisine_type, created_at
)
users (id, restaurant_id, email, role)

-- Suppliers
suppliers (id, canonical_name, aliases TEXT[], is_broadline BOOL)

-- Documents
documents (
  id, restaurant_id, storage_key, content_sha256 UNIQUE,
  mime, source_channel, status, created_at
)

invoices (
  id, document_id, restaurant_id, supplier_id,
  invoice_number, invoice_date, delivery_date,
  subtotal, tax, total,
  extraction_provider, extraction_version,
  validation_status, reviewed_by, reviewed_at,
  UNIQUE (restaurant_id, supplier_id, invoice_number)
)

-- Lines
invoice_lines (
  id, invoice_id, line_index,
  raw_description, supplier_sku,
  quantity, pack_descriptor, unit_price, line_total,
  line_kind,              -- item | credit | fee | tax | deposit
  catch_weight_kg,
  canonical_item_id,      -- nullable until mapped
  
  -- Explicit packaging math separated from pack_descriptor
  pack_units INT DEFAULT 1,
  pack_size NUMERIC,
  pack_measure VARCHAR(10),

  price_per_base_unit,    -- nullable until computed
  is_promotional BOOL,
  confidence NUMERIC
)

-- Canonical catalogue
canonical_items (
  id, name, category, base_unit,     -- kg | L | each
  benchmarkable BOOL,
  embedding VECTOR(768)
)
canonical_item_aliases (id, canonical_item_id, alias, source)

-- The normalization cache
sku_mappings (
  id, supplier_id, supplier_sku, canonical_item_id,
  pack_units INT DEFAULT 1,
  pack_size NUMERIC,
  pack_measure VARCHAR(10),
  confidence, confirmed_by, confirmed_at,
  UNIQUE (supplier_id, supplier_sku)
)

-- Review queues
review_items (
  id, kind,               -- extraction | mapping | pack_parse
  invoice_id, invoice_line_id, payload JSONB,
  status, assignee, resolved_at
)

-- Benchmark materialization
benchmark_observations (
  id, restaurant_id, canonical_item_id, supplier_id,
  observed_on DATE, price_per_base_unit,
  geom GEOGRAPHY(POINT, 4326)
)
```

## **6.1 Benchmark Function Contract**

All benchmark reads go through one function. No exceptions, no ad-hoc queries.

```sql
get_benchmark(
  p_restaurant_id   UUID,
  p_canonical_item  UUID,
  p_window_days     INT     -- server-constrained: 30 | 90 only
) RETURNS TABLE (
  p25 NUMERIC, p50 NUMERIC, p75 NUMERIC,
  n_restaurants INT,
  radius_km_used INT,
  window_start DATE, window_end DATE,
  suppressed BOOL,
  suppression_reason TEXT
)
```

The function climbs the radius ladder, applies the k-anonymity and dominance checks at each rung, and returns suppressed \= true with a reason rather than ever returning a thin cell.  
---

# **7\. Extraction Evaluation (Simplified for Prototype)**

To accelerate time-to-value for the solo developer:  
Develop the functional application using **mock JSON invoice data** to build out the normalization queue, database schemas, and frontend UI without waiting on physical documents.  
Once the team sources \~15 real invoices, evaluate extraction locally using a Vision LLM or Google Document AI. The automated CI evaluation harness is deferred.  
Target for prototype acceptance remains: **≥95% line-item recall** and **≥98% arithmetic validation pass rate** after the review queue.  
---

# **8\. Build Order (4–6 weeks for Solo Dev)**

**Phase 0 — Foundations (week 1\)**  
Repo, CI, Postgres with extensions, auth, object storage, tenancy \+ RLS, Sentry. Generate mock database records.  
**Phase 1 — Ingestion & extraction (week 2\)**  
Web upload only. Async extraction pipeline (FastAPI BackgroundTasks). Test extraction provider against initial mock payload. Arithmetic validation.  
**Phase 2 — Normalization (week 3\)**  
Canonical catalogue seeded (100–150 items). Pack descriptor parser. sku\_mappings cache. Internal mapping review UI (keyboard-navigable). Price-per-base-unit computation, including catch-weight and credit handling.  
**Phase 3 — Audit dashboard (week 4\)**  
Per-item price history. Spend by category and supplier. Fee tracking. Baseline-relative price-change alerts (pre-cohort).  
**Phase 4 — Benchmarking (week 5\)**  
benchmark\_observations materialization. get\_benchmark function with enforced k-anonymity and the radius ladder. Benchmark UI with sample size, geography label, and gross-price comparability caveats. Contribute-to-consume gating. Cohort-aware alert classification.

# **Core Concept**

Sous is a restaurant software platform designed to address rising food costs by providing localized, anonymous price benchmarking and automated invoice auditing. While competitors like Kosto focus purely on catching supplier overcharges, Sous differentiates itself by allowing small restaurants to compare their invoice pricing against aggregate, anonymous data from other restaurants in their area.

# **Key Functionality & Technical Requirements**

* **Invoice Ingestion Engine:** An upload portal accepting PDFs and images, utilizing Optical Character Recognition (OCR) to automatically extract line items, quantities, and prices.  
* **Data Normalization Pipeline:** A robust system to standardize messy supplier data (e.g., mapping "Tomatoes, Roma 20lb" and "Roma Tom. 20\#" to a universal "Roma Tomato" category) to enable accurate local benchmarking.  
* **Internal Audit Dashboard:** The baseline feature allowing users to track their own historical pricing and receive automated alerts for sudden supplier price hikes.  
* **Geospatial Benchmarking:** The core differentiator that aggregates normalized data within a specific geographic radius, stripping all identifying business information, to show users where their pricing falls relative to the local market.

# **Recommended Tech Stack**

* **Frontend (User Interface):** Next.js (React) styled with Tailwind CSS for rapid development of a fast, professional web app.  
* **Backend (API & Logic):** Python using FastAPI. Python's data processing capabilities are well-suited for parsing and sorting complex invoice data.  
* **Database:** PostgreSQL. A relational database is essential for managing the highly structured relationships between restaurants, suppliers, invoices, and standardized ingredient catalogs.  
* **Data Extraction (OCR):** Google Cloud Document AI or AWS Textract to handle receipt and invoice reading.

