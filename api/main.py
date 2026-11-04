from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

try:
    from .database import get_db
    from .routers import invoices, review, benchmarks, audit, catalog, company
except (ImportError, ValueError):
    from database import get_db
    from routers import invoices, review, benchmarks, audit, catalog, company

app = FastAPI(
    title="Sous API",
    description="Restaurant cost-intelligence platform with localized anonymous benchmarking",
    version="0.1.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(invoices.router)
app.include_router(review.router)
app.include_router(benchmarks.router)
app.include_router(audit.router)
app.include_router(catalog.router)
app.include_router(company.router)


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint that verifies API and database status."""
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unreachable ({type(e).__name__})"

    return {
        "status": "ok",
        "app": "Sous API",
        "database": db_status
    }
