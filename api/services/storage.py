"""
Storage Service for Sous.
Manages persistent object storage for uploaded invoices and receipts.
Primary backend: Supabase Storage (AWS S3-compatible object store).
Fallback/Cache: Local disk cache for offline dev and zero-latency PDF stream extraction.
"""

import os
import httpx
from typing import Optional, Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip() or None
SUPABASE_SERVICE_ROLE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip() or None
UPLOAD_STORAGE_DIR = os.getenv("UPLOAD_STORAGE_DIR", "/tmp/sous_uploads")
os.makedirs(UPLOAD_STORAGE_DIR, exist_ok=True)

BUCKET_NAME = "invoices"


def get_supabase_headers() -> dict:
    if not SUPABASE_SERVICE_ROLE_KEY:
        return {}
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }


def ensure_bucket_exists():
    """Idempotently ensure the invoices bucket exists in Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    try:
        headers = get_supabase_headers()
        headers["Content-Type"] = "application/json"
        payload = {
            "id": BUCKET_NAME,
            "name": BUCKET_NAME,
            "public": False,
            "file_size_limit": 52428800,  # 50 MB
            "allowed_mime_types": [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/heic",
                "application/octet-stream",
            ],
        }
        with httpx.Client(timeout=10.0) as client:
            client.post(f"{SUPABASE_URL}/storage/v1/bucket", headers=headers, json=payload)
    except Exception as e:
        print(f"[STORAGE WARNING] Failed to ensure bucket {BUCKET_NAME}: {e}")


def upload_invoice_file(
    content: bytes,
    restaurant_id: str,
    content_sha256: str,
    original_filename: str,
    mime: str = "application/pdf"
) -> Tuple[str, str]:
    """
    Persist uploaded invoice to Supabase Storage (S3) and write to local cache for PDF extraction.
    Returns:
        (storage_key, local_cache_path)
    """
    ext = os.path.splitext(original_filename)[1] or ".pdf"
    object_path = f"{restaurant_id}/{content_sha256}{ext}"
    local_path = os.path.join(UPLOAD_STORAGE_DIR, f"{content_sha256}_{original_filename}")

    # Always write to local cache so pipeline PDF parsing has immediate file access
    try:
        with open(local_path, "wb") as f:
            f.write(content)
    except Exception as e:
        print(f"[STORAGE WARNING] Failed writing to local cache: {e}")

    # Upload to Supabase Storage (S3)
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        try:
            headers = get_supabase_headers()
            headers["Content-Type"] = mime or "application/pdf"
            headers["x-upsert"] = "true"

            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{object_path}",
                    headers=headers,
                    content=content
                )
                if resp.status_code in (200, 201):
                    storage_key = f"supabase://{BUCKET_NAME}/{object_path}"
                    return storage_key, local_path
                else:
                    print(f"[STORAGE ERROR] Supabase upload failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[STORAGE ERROR] Supabase upload exception: {e}")

    # Fallback to local storage path if Supabase is unavailable
    return local_path, local_path


def get_invoice_signed_url(storage_key: str, expires_in: int = 3600) -> Optional[str]:
    """
    Generates a secure presigned URL (valid for expires_in seconds) from Supabase Storage.
    Returns None if file is only on local disk or Supabase is not configured.
    """
    if not storage_key:
        return None

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    object_path = None
    if storage_key.startswith("supabase://"):
        # Format: supabase://invoices/{restaurant_id}/{sha}.pdf
        parts = storage_key.replace("supabase://", "").split("/", 1)
        if len(parts) == 2:
            object_path = parts[1]
    elif "/" in storage_key and not storage_key.startswith("/"):
        object_path = storage_key

    if not object_path:
        return None

    try:
        headers = get_supabase_headers()
        headers["Content-Type"] = "application/json"
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET_NAME}/{object_path}",
                headers=headers,
                json={"expiresIn": expires_in}
            )
            if resp.status_code == 200:
                signed_path = resp.json().get("signedURL")
                return f"{SUPABASE_URL}/storage/v1{signed_path}"
            else:
                print(f"[STORAGE WARNING] Failed to generate signed URL ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"[STORAGE ERROR] Exception generating signed URL: {e}")

    return None


def delete_invoice_file(storage_key: str):
    """Clean up file from Supabase Storage and local cache."""
    if not storage_key:
        return

    # 1. Local disk cleanup
    if os.path.exists(storage_key):
        try:
            os.remove(storage_key)
        except Exception:
            pass

    # 2. Supabase Storage cleanup
    if storage_key.startswith("supabase://") and SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        parts = storage_key.replace("supabase://", "").split("/", 1)
        if len(parts) == 2:
            object_path = parts[1]
            try:
                headers = get_supabase_headers()
                headers["Content-Type"] = "application/json"
                # Supabase Storage delete endpoint expects request with json prefixes
                httpx.request(
                    "DELETE",
                    f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}",
                    headers=headers,
                    json={"prefixes": [object_path]},
                    timeout=10.0
                )
            except Exception as e:
                print(f"[STORAGE WARNING] Failed deleting from Supabase: {e}")


def get_local_file_path(storage_key: str, content_sha256: Optional[str] = None) -> Optional[str]:
    """
    Ensures a local file exists for PDF stream extraction.
    If storage_key is local and exists, returns it.
    If storage_key is in Supabase, checks local cache or downloads bytes from Supabase Storage.
    """
    if not storage_key:
        return None

    # 1. Direct path check
    if os.path.exists(storage_key):
        return storage_key

    # 2. Check local upload directory cache
    if content_sha256 and os.path.exists(UPLOAD_STORAGE_DIR):
        try:
            for fname in os.listdir(UPLOAD_STORAGE_DIR):
                if fname.startswith(content_sha256):
                    fpath = os.path.join(UPLOAD_STORAGE_DIR, fname)
                    if os.path.exists(fpath):
                        return fpath
        except Exception:
            pass

    # 3. If in Supabase Storage, download to local cache
    if storage_key.startswith("supabase://") and SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        parts = storage_key.replace("supabase://", "").split("/", 1)
        if len(parts) == 2:
            object_path = parts[1]
            try:
                headers = get_supabase_headers()
                with httpx.Client(timeout=20.0) as client:
                    resp = client.get(
                        f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{object_path}",
                        headers=headers
                    )
                    if resp.status_code == 200:
                        cached_path = os.path.join(
                            UPLOAD_STORAGE_DIR,
                            f"{content_sha256 or 'doc'}_{os.path.basename(object_path)}"
                        )
                        with open(cached_path, "wb") as f:
                            f.write(resp.content)
                        return cached_path
            except Exception as e:
                print(f"[STORAGE ERROR] Failed downloading from Supabase for extraction: {e}")

    return None
