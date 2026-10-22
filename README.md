# Sous

Sous is a restaurant cost-intelligence platform for independent operators. It ingests supplier invoices, normalizes line items to per-unit economics ($\$/\text{kg}$, $\$ /\text{L}$, $\$ /\text{each}$), audits historical price changes and surcharge leaks, and benchmarks prices against a $k$-anonymous local cohort of participating restaurants in the Greater Toronto Area.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React 19, Tailwind CSS, Lucide Icons
- **Backend:** Python 3, FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL 16 with PostGIS (geospatial cohort ladder) and pgvector (ingredient similarity embeddings)
- **Auth:** Supabase Auth with JWT verification

---

## Prerequisites

Before starting, ensure you have the following installed and running:
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (must be running to host PostgreSQL + PostGIS + pgvector)
- **Python 3.11+**
- **Node.js 18+** & `npm`

---

## Quickstart Guide

### 1. Start the Database (Docker)

From the project root, launch the PostgreSQL container:

```bash
docker compose up -d
```

Verify that the database container is up and healthy:

```bash
docker compose ps
```

---

### 2. Start the Backend API (FastAPI)

1. **Activate the virtual environment:**
   ```bash
   cd api
   source .venv/bin/activate
   ```
   *(If creating a fresh virtual environment: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`)*

2. **Run database migrations:**
   Initializes the database schema and enables extensions (`uuid-ossp`, `postgis`, `vector`, `pg_trgm`):
   ```bash
   alembic upgrade head
   ```

3. **Seed mock data (recommended for development):**
   Seeds 15 GTA restaurants, suppliers (Sysco, GFS, Flanagan), 100+ commodity items, and realistic price observations:
   ```bash
   python seed_mock_data.py
   ```
   *(Optional: run `python seed_unlock_benchmarks.py` to pre-unlock benchmark access for the primary test restaurant).*

4. **Start the FastAPI server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

The backend is now live:
- **API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Start the Web Frontend (Next.js)

In a separate terminal window:

1. **Navigate to the web directory and install dependencies:**
   ```bash
   cd web
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open the web application:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Repository Structure

```
sous/
├── api/                        # FastAPI backend application
│   ├── alembic/                # Database migrations & schema definitions
│   ├── routers/                # API route handlers (audit, benchmarks, invoices, review, catalog)
│   ├── services/pipeline.py    # Invoice extraction, validation & normalization pipeline
│   ├── auth.py                 # Supabase JWT authentication & tenant resolution
│   ├── database.py             # SQLAlchemy engine & session setup
│   ├── models.py               # ORM data models
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── seed_mock_data.py       # Realistic GTA test dataset generator
│   └── requirements.txt        # Python package dependencies
├── web/                        # Next.js frontend application
│   └── src/
│       ├── app/                # App router pages (dashboard, invoices, review, benchmarks)
│       ├── components/         # Shared UI components
│       └── lib/api.ts          # API client for FastAPI backend
├── test_invoices/              # Sample distributor PDF invoices
├── docker-compose.yml          # Container configuration for Postgres + PostGIS + pgvector
├── Dockerfile.db               # Custom Postgres image with pgvector & PostGIS
└── generate_test_invoices.py   # Script to generate synthetic test PDFs
```

---

## Stopping the Services

- To stop the backend or frontend: press `Ctrl + C` in the respective terminal.
- To stop the database container:
  ```bash
  docker compose down
  ```
  *(To remove database volumes and start completely fresh: `docker compose down -v`)*
# Sous

Sous is a restaurant cost-intelligence platform for independent operators. It ingests supplier invoices, normalizes line items to per-unit economics ($\$/\text{kg}$, $\$ /\text{L}$, $\$ /\text{each}$), audits historical price changes and surcharge leaks, and benchmarks prices against a $k$-anonymous local cohort of participating restaurants in the Greater Toronto Area.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React 19, Tailwind CSS, Lucide Icons
- **Backend:** Python 3, FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL 16 with PostGIS (geospatial cohort ladder) and pgvector (ingredient similarity embeddings)
- **Auth:** Supabase Auth with JWT verification

---

## Prerequisites

Before starting, ensure you have the following installed and running:
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (must be running to host PostgreSQL + PostGIS + pgvector)
- **Python 3.11+**
- **Node.js 18+** & `npm`

---

## Quickstart Guide

### 1. Start the Database (Docker)

From the project root, launch the PostgreSQL container:

```bash
docker compose up -d
```

Verify that the database container is up and healthy:

```bash
docker compose ps
```

---

### 2. Start the Backend API (FastAPI)

1. **Activate the virtual environment:**
   ```bash
   cd api
   source .venv/bin/activate
   ```
   *(If creating a fresh virtual environment: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`)*

2. **Run database migrations:**
   Initializes the database schema and enables extensions (`uuid-ossp`, `postgis`, `vector`, `pg_trgm`):
   ```bash
   alembic upgrade head
   ```

3. **Seed mock data (recommended for development):**
   Seeds 15 GTA restaurants, suppliers (Sysco, GFS, Flanagan), 100+ commodity items, and realistic price observations:
   ```bash
   python seed_mock_data.py
   ```
   *(Optional: run `python seed_unlock_benchmarks.py` to pre-unlock benchmark access for the primary test restaurant).*

4. **Start the FastAPI server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

The backend is now live:
- **API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Start the Web Frontend (Next.js)

In a separate terminal window:

1. **Navigate to the web directory and install dependencies:**
   ```bash
   cd web
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open the web application:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Repository Structure

```
sous/
├── api/                        # FastAPI backend application
│   ├── alembic/                # Database migrations & schema definitions
│   ├── routers/                # API route handlers (audit, benchmarks, invoices, review, catalog)
│   ├── services/pipeline.py    # Invoice extraction, validation & normalization pipeline
│   ├── auth.py                 # Supabase JWT authentication & tenant resolution
│   ├── database.py             # SQLAlchemy engine & session setup
│   ├── models.py               # ORM data models
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── seed_mock_data.py       # Realistic GTA test dataset generator
│   └── requirements.txt        # Python package dependencies
├── web/                        # Next.js frontend application
│   └── src/
│       ├── app/                # App router pages (dashboard, invoices, review, benchmarks)
│       ├── components/         # Shared UI components
│       └── lib/api.ts          # API client for FastAPI backend
├── test_invoices/              # Sample distributor PDF invoices
├── docker-compose.yml          # Container configuration for Postgres + PostGIS + pgvector
├── Dockerfile.db               # Custom Postgres image with pgvector & PostGIS
└── generate_test_invoices.py   # Script to generate synthetic test PDFs
```

---

## Stopping the Services

- To stop the backend or frontend: press `Ctrl + C` in the respective terminal.
- To stop the database container:
  ```bash
  docker compose down
  ```
  *(To remove database volumes and start completely fresh: `docker compose down -v`)*