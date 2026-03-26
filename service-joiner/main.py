"""
service-joiner Service
======================
Combines markdown files into merged documents:
- tender_full.md: all tender + normative files
- proposal_full.md: one per proposal (grouped by proposal_id)

Uploads merged files to Supabase Storage and creates file records with is_merged=true.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_FILES_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
from collections import defaultdict
from uuid import uuid4

import requests
from supabase import create_client
from supabase_logger import setup_logger, log_event

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-joiner"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
STORAGE_BUCKET = "files"

logger = setup_logger(SERVICE_NAME)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None) -> dict | list | None:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = requests.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
    """Ensure all required environment variables are set."""
    missing = [
        var for var, val in [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_FILES_PATH", API_FILES_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def download_file(supabase, storage_path: str) -> bytes:
    """Download a file from Supabase Storage."""
    return supabase.storage.from_(STORAGE_BUCKET).download(storage_path)


def upload_file(supabase, storage_path: str, content: bytes):
    """Upload a file to Supabase Storage."""
    supabase.storage.from_(STORAGE_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": "text/markdown"},
    )


def create_merged_file_record(file_name: str, storage_path: str, content: bytes,
                               category: str, proposal_id: str | None = None) -> dict:
    """Create a file record for a merged file via the API."""
    record = {
        "id": str(uuid4()),
        "analysis_id": ANALYSIS_ID,
        "file_name": file_name,
        "storage_path": storage_path,
        "category": category,
        "file_size": len(content),
        "mime_type": "text/markdown",
        "is_processed_version": True,
        "is_merged": True,
    }
    if proposal_id:
        record["proposal_id"] = proposal_id
    return api_request("POST", f"{API_FILES_PATH}", record)


def concatenate_files(supabase, files: list[dict]) -> bytes:
    """Download and concatenate markdown files with separators."""
    parts = []
    for f in files:
        storage_path = f.get("storage_path")
        file_name = f.get("file_name", "unknown")
        if not storage_path:
            logger.warning(f"Skipping '{file_name}' — no storage_path.")
            continue
        try:
            content = download_file(supabase, storage_path)
            text = content.decode("utf-8")
            parts.append(f"# {file_name}\n\n{text}")
        except Exception as e:
            logger.error(f"Failed to download '{file_name}': {e}")
    return "\n\n---\n\n".join(parts).encode("utf-8")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def process_joiner():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}")

    # 1. Fetch analysis slug
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"].strip()
    logger.info(f"Analysis slug: {slug}")

    # 2. Fetch all files
    files = api_request("POST", f"{API_FILES_PATH}search", {"analysis_id": ANALYSIS_ID})
    if not files:
        logger.warning("No files found for this analysis.")
        log_event(ANALYSIS_ID, "warning", "No se encontraron archivos para unir.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    # 3. Filter processed markdown files with category
    md_files = [
        f for f in files
        if f.get("is_processed_version") is True and f.get("category") and not f.get("is_merged")
    ]
    logger.info(f"Found {len(md_files)} processed markdown files with category.")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    merged_count = 0

    # 4. Generate tender_full.md (tender + normative)
    tender_files = [f for f in md_files if f.get("category") in ("tender", "normative")]
    if tender_files:
        logger.info(f"Merging {len(tender_files)} tender/normative files into tender_full.md")
        content = concatenate_files(supabase, tender_files)

        file_id = str(uuid4())
        storage_path = f"{slug}/{file_id}.md"
        upload_file(supabase, storage_path, content)
        create_merged_file_record("tender_full.md", storage_path, content, "tender")

        logger.info(f"Uploaded tender_full.md ({len(content)} bytes)")
        log_event(ANALYSIS_ID, "info", f"tender_full.md creado ({len(tender_files)} archivos, {len(content)} bytes).", EVENT_SOURCE)
        merged_count += 1
    else:
        logger.info("No tender/normative files to merge.")

    # 5. Generate proposal_full.md per proposal_id
    proposal_files = [f for f in md_files if f.get("category") == "proposal" and f.get("proposal_id")]
    proposals_by_id = defaultdict(list)
    for f in proposal_files:
        proposals_by_id[f["proposal_id"]].append(f)

    for proposal_id, p_files in proposals_by_id.items():
        logger.info(f"Merging {len(p_files)} files for proposal {proposal_id}")
        content = concatenate_files(supabase, p_files)

        file_id = str(uuid4())
        storage_path = f"{slug}/{file_id}.md"
        upload_file(supabase, storage_path, content)
        create_merged_file_record("proposal_full.md", storage_path, content, "proposal", proposal_id)

        logger.info(f"Uploaded proposal_full.md for proposal {proposal_id} ({len(content)} bytes)")
        log_event(ANALYSIS_ID, "info", f"proposal_full.md creado para propuesta {proposal_id} ({len(p_files)} archivos).", EVENT_SOURCE)
        merged_count += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Proceso de unión completado: {merged_count} archivos merged creados.",
        EVENT_SOURCE,
    )
    logger.info(f"{SERVICE_NAME} complete — {merged_count} merged files created.")

    # 6. Notify success callback
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "status": "success",
    })


def main():
    validate_env()
    try:
        process_joiner()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during processing: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during processing: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
