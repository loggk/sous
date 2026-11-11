import urllib.parse
from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
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


@app.middleware("http")
async def normalize_vercel_rewrites(request: Request, call_next):
    """
    Vercel rewrites send requests to /main.py, altering scope['path'].
    Normalize scope['path'] back to the intended application route.
    """
    path = request.scope.get("path", "")
    if path.startswith("/main.py"):
        request.scope["path"] = path[len("/main.py"):] or "/"
    elif path.startswith("/index.py"):
        request.scope["path"] = path[len("/index.py"):] or "/"

    if request.scope.get("path") in ("/", "/main.py", "/index.py"):
        original_route = (
            request.headers.get("x-matched-path")
            or request.headers.get("x-invoke-path")
            or request.headers.get("x-forwarded-uri")
        )
        if original_route:
            parsed = urllib.parse.urlparse(original_route)
            if parsed.path and parsed.path not in ("/", "/main.py", "/index.py"):
                request.scope["path"] = parsed.path

    response = await call_next(request)
    return response


# Register routers (both root and /api prefixes for full client compatibility)
for r in [
    invoices.router,
    review.router,
    benchmarks.router,
    audit.router,
    catalog.router,
    company.router,
]:
    app.include_router(r)
    app.include_router(r, prefix="/api")


@app.get("/")
def root():
    return {
        "status": "ok",
        "app": "Sous API",
        "version": "0.1.0"
    }


@app.get("/health")
@app.get("/api/health")
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


@app.exception_handler(404)
async def custom_404_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "detail": "Not Found",
            "path": request.scope.get("path"),
            "x_matched_path": request.headers.get("x-matched-path"),
            "x_invoke_path": request.headers.get("x-invoke-path"),
            "headers": {
                k: v
                for k, v in request.headers.items()
                if "authorization" not in k.lower() and "cookie" not in k.lower()
            },
        },
    )

