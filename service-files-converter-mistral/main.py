"""
Files Converter Service (Mistral OCR)
======================================
Downloads tender files from Supabase Storage for a given analysis_id,
converts each to Markdown using Mistral OCR, and uploads individual .md files
back to Supabase Storage.

Required environment variables:
  - SUPABASE_URL              : Supabase project URL
  - SUPABASE_SERVICE_KEY      : Service role key for authenticated access
  - MISTRAL_API_KEY           : Mistral API key for OCR
  - API_BASE_URL              : Backend API base URL
  - API_KEY                   : API key for backend authentication
  - API_EVENTS_PATH           : Path for events endpoint
  - API_ORIGINAL_FILES_PATH   : Path for original files endpoint
  - API_PROCESSED_FILES_PATH  : Path for processed files endpoint
  - API_ANALYSES_PATH         : Path for analyses endpoint (optional, default: /api/v1/analyses/)
  - API_PROPOSALS_PATH        : Path for proposals endpoint (optional, default: /api/v1/proposals/)
  - API_JOBS_CALLBACK         : Path for job completion callback endpoint
  - ANALYSIS_ID               : UUID of the analysis to process
"""

import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from mistralai.client import Mistral
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ORIGINAL_FILES_PATH = os.environ.get("API_ORIGINAL_FILES_PATH")
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH", "/api/v1/analyses/")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH", "/api/v1/proposals/")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-files-converter-mistral"
WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
STORAGE_BUCKET = "files"
MAX_FILE_SIZE_MB = 45  # Mistral OCR proxy limit (~50 MB); reject before upload
OCR_MAX_RETRIES = 3
OCR_RETRY_DELAYS = [10, 30, 60]  # seconds

logger = setup_logger("files-converter-mistral")
SESSION = make_session()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | None = None) -> dict | list:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    return response.json()


def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not MISTRAL_API_KEY:
        missing.append("MISTRAL_API_KEY")
    if not API_BASE_URL:
        missing.append("API_BASE_URL")
    if not API_KEY:
        missing.append("API_KEY")
    if not API_EVENTS_PATH:
        missing.append("API_EVENTS_PATH")
    if not API_ORIGINAL_FILES_PATH:
        missing.append("API_ORIGINAL_FILES_PATH")
    if not API_PROCESSED_FILES_PATH:
        missing.append("API_PROCESSED_FILES_PATH")
    if not API_JOBS_CALLBACK:
        missing.append("API_JOBS_CALLBACK")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def get_client() -> Mistral:
    """Initialize and return the Mistral client."""
    return Mistral(api_key=MISTRAL_API_KEY)


def parse_file(client: Mistral, file_path: str) -> str:
    """Upload and parse a single file via Mistral OCR, returning Markdown content."""
    logger.info(f"Parsing file: {file_path} ...")

    # Step 1: Upload file to Mistral Files API
    with open(file_path, "rb") as f:
        uploaded = client.files.upload(
            file={"file_name": Path(file_path).name, "content": f},
            purpose="ocr",
        )
    logger.info(f"Subido a Mistral Files API, file_id={uploaded.id}")

    try:
        # Step 2: Get a signed URL for the uploaded file
        signed = client.files.get_signed_url(file_id=uploaded.id)

        # Step 3: Run OCR with retry on transient errors
        last_exc = None
        for attempt in range(OCR_MAX_RETRIES):
            try:
                result = client.ocr.process(
                    model="mistral-ocr-latest",
                    document={"type": "document_url", "document_url": signed.url},
                )
                last_exc = None
                break
            except Exception as e:
                last_exc = e
                if attempt < OCR_MAX_RETRIES - 1:
                    delay = OCR_RETRY_DELAYS[attempt]
                    logger.warning(f"OCR attempt {attempt + 1} failed, retrying in {delay}s: {e}")
                    time.sleep(delay)

        if last_exc is not None:
            raise last_exc

        pages = result.pages if result.pages else []
        return "\n\n".join(page.markdown for page in pages if page.markdown)

    finally:
        # Step 4: Clean up — Mistral almacena archivos persistentemente
        try:
            client.files.delete(file_id=uploaded.id)
            logger.info(f"Archivo eliminado de Mistral Files API: {uploaded.id}")
        except Exception as e:
            logger.warning(f"No se pudo eliminar archivo de Mistral (id={uploaded.id}): {e}")


def upload_markdown(
    supabase: Client,
    analysis_id: str,
    slug: str,
    file_name: str,
    content: str,
    folder_path: str | None = None,
    source_file_id: str | None = None,
) -> dict:
    """
    Upload a Markdown string to Supabase Storage and insert a record
    via the backend API.

    Returns the inserted file record dict.
    """
    file_id = str(uuid.uuid4())

    if folder_path:
        storage_path = f"{folder_path}/{file_id}.md"
    else:
        storage_path = f"{slug}/{file_id}.md"

    content_bytes = content.encode("utf-8")

    # Upload to Supabase Storage (direct)
    supabase.storage.from_(STORAGE_BUCKET).upload(
        path=storage_path,
        file=content_bytes,
        file_options={"content-type": "text/markdown"},
    )
    logger.info(f"Uploaded {storage_path} ({len(content_bytes)} bytes)")

    # Insert file record via API
    record = {
        "analysis_id": analysis_id,
        "file_name": file_name,
        "storage_path": storage_path,
        "category": None,
        "file_size": len(content_bytes),
        "mime_type": "text/markdown",
        "is_merged": False,
        "link": source_file_id,
    }

    api_request("POST", API_PROCESSED_FILES_PATH, record)
    logger.info(f"Inserted file record via API: {file_name} (id={file_id})")

    return record


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
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def process_conversion():
    logger.info(f"Starting files converter (Mistral OCR) for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase (only for Storage operations)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 2. Fetch the analysis to get the slug via API
    logger.info("Fetching analysis via API …")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")

    slug = analysis["slug"].strip()
    logger.info(f"Found analysis — slug={slug}")
    log_event(ANALYSIS_ID, "info", "Inicio de conversión de archivos (Mistral OCR)", EVENT_SOURCE)

    logger.info("Querying files via API …")
    all_files = api_request("POST", f"{API_ORIGINAL_FILES_PATH}search", {"analysis_id": ANALYSIS_ID})

    files_to_process = all_files

    if files_to_process:
        logger.info(f"Found {len(files_to_process)} file(s) to process")
        log_event(
            ANALYSIS_ID,
            "info",
            f"Encontrados {len(files_to_process)} archivos para convertir",
            EVENT_SOURCE,
            {"files": [f["file_name"] for f in files_to_process]},
        )

        # Initialize Mistral client
        client = get_client()

        work_dir = WORKSPACE_DIR / ANALYSIS_ID / "processing"
        work_dir.mkdir(parents=True, exist_ok=True)

        for idx, file_record in enumerate(files_to_process, 1):
            file_name = file_record["file_name"]
            storage_path = file_record["storage_path"]

            logger.info(f"[{idx}/{len(files_to_process)}] Processing: {file_name}")

            # Download
            try:
                file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
            except Exception as e:
                logger.error(f"Failed to download {file_name}: {e}")
                log_event(ANALYSIS_ID, "error", f"No se pudo descargar el archivo: {file_name}. Error: {e}", EVENT_SOURCE)
                continue  # Skip failing file instead of exiting

            # Save local
            local_path = work_dir / file_name
            local_path.write_bytes(file_bytes)

            # Validate file size before uploading to Mistral
            file_size_mb = local_path.stat().st_size / (1024 * 1024)
            if file_size_mb > MAX_FILE_SIZE_MB:
                logger.warning(f"{file_name} is {file_size_mb:.1f} MB, exceeds limit of {MAX_FILE_SIZE_MB} MB — skipping")
                log_event(ANALYSIS_ID, "warning", f"Archivo omitido por tamaño excesivo ({file_size_mb:.1f} MB): {file_name}", EVENT_SOURCE)
                local_path.unlink(missing_ok=True)
                continue

            # Parse
            try:
                md_content = parse_file(client, str(local_path))
            except Exception as e:
                logger.error(f"Failed to parse {file_name}: {e}")
                log_event(ANALYSIS_ID, "error", f"No se pudo convertir el archivo: {file_name}. Error: {e}", EVENT_SOURCE)
                continue

            # Upload individual .md
            md_file_name = Path(file_name).stem + ".md"
            # Extract folder path from original storage path to keep .md in same folder
            original_folder = str(Path(storage_path).parent)

            try:
                upload_markdown(
                    supabase,
                    ANALYSIS_ID,
                    slug,
                    md_file_name,
                    md_content,
                    folder_path=original_folder,
                    source_file_id=file_record["id"],
                )
            except Exception as e:
                logger.error(f"Failed to upload {md_file_name}: {e}")
                log_event(ANALYSIS_ID, "error", f"No se pudo subir el archivo convertido: {md_file_name}. Error: {e}", EVENT_SOURCE)

            # Cleanup
            local_path.unlink(missing_ok=True)

    log_event(ANALYSIS_ID, "info", "Conversión de archivos completada (Mistral OCR)", EVENT_SOURCE)

    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success"
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")

    logger.info("Files conversion service (Mistral OCR) complete ✓")


def main():
    validate_env()
    try:
        process_conversion()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during processing: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during processing: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
