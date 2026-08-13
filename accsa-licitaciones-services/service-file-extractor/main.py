"""
File Extractor Service
======================
Queries the backend API for a specific analysis by ID, reads the batch manifest
the browser left under the artifact prefix, and moves every document listed in it
to Supabase Storage, one file at a time.

Required environment variables:
  - SUPABASE_URL               : Supabase project URL
  - SUPABASE_SERVICE_KEY  : Service role key for authenticated access
  - SUPABASE_ARTIFACTS_BASE_URL: Base URL for artifact downloads
  - API_BASE_URL               : Backend API base URL
  - API_KEY                    : API key for backend authentication
  - API_EVENTS_PATH            : Path for events endpoint
  - API_PROPOSALS_PATH         : Path for proposals endpoint
  - API_ANALYSES_PATH          : Path for analyses endpoint
  - API_ORIGINAL_FILES_PATH             : Path for files endpoint
  - ANALYSIS_ID                : UUID of the analysis to process
"""

import os
import sys
import uuid
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import requests

from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
SUPABASE_ARTIFACTS_BASE_URL = os.environ.get("SUPABASE_ARTIFACTS_BASE_URL")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_ORIGINAL_FILES_PATH = os.environ.get("API_ORIGINAL_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = 'service-file-extractor'
WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | None = None) -> dict | list | None:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


PDF_HEADER = b"%PDF-"


def pdf_rejection_reason(file_path: Path) -> str | None:
    """
    Return why the file is not a valid PDF (a .pdf extension plus the %PDF-
    signature near the start), or None if it is a valid PDF.
    """
    if file_path.suffix.lower() != ".pdf":
        return "la extensión no es .pdf"
    try:
        with open(file_path, "rb") as f:
            header = f.read(1024)
    except OSError as e:
        return f"no se pudo leer el archivo: {e}"
    if PDF_HEADER not in header:
        return "el contenido no es un PDF válido"
    return None


class NoValidPdfError(Exception):
    """Raised when no valid PDF remains to process after skipping."""


class IncompleteBatchError(Exception):
    """Raised when the batch has no manifest, meaning the upload never finished."""


def download_to_disk(url: str, dest: Path):
    """
    Download an object straight to disk in chunks. Never hold a whole file in
    memory: the container is capped at 1536 MB and a batch can be gigabytes.
    """
    with requests.get(url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)


def upload_and_index_file(supabase: Client, analysis_id: str, slug: str, file_path: Path, file_name: str):
    """
    Upload one document to the 'files' bucket and insert its row via the API.
    Target path: files/<slug>/<file_id><suffix>

    `file_name` is the original name from the manifest, not the numeric storage
    key, so the interface shows the document the user recognises.
    """
    file_id = str(uuid.uuid4())
    storage_path = f"{slug}/{file_id}{file_path.suffix}"

    mime_type, _ = mimetypes.guess_type(file_name)
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        with open(file_path, "rb") as f:
            supabase.storage.from_("files").upload(
                path=storage_path,
                file=f,
                file_options={"content-type": mime_type}
            )
    except Exception as e:
        logger.error(f"Failed to upload {file_name}: {e}")
        raise e

    file_record = {
        "analysis_id": analysis_id,
        "file_name": file_name,
        "storage_path": storage_path,
        "category": None,
        "file_size": file_path.stat().st_size,
        "mime_type": mime_type,
    }

    try:
        api_request("POST", API_ORIGINAL_FILES_PATH, file_record)
    except Exception as e:
        logger.error(f"Failed to insert file record for {file_name}: {e}")
        raise e


def _is_object_not_found(response) -> bool:
    """
    Storage answers a missing object with HTTP 400 and a body whose statusCode
    is 404, so the HTTP status on its own is not enough to tell it apart from a
    real bad request.
    """
    if response.status_code == 404:
        return True
    if response.status_code != 400:
        return False
    try:
        return response.json().get("statusCode") == "404"
    except ValueError:
        return False


def fetch_manifest(manifest_url: str) -> dict:
    """
    Read the batch manifest. It is uploaded last by the browser, so its absence
    means the upload was cut short and the batch must not be processed.
    """
    response = requests.get(manifest_url, timeout=60)
    if _is_object_not_found(response):
        raise IncompleteBatchError(
            "No se encontró el manifiesto del lote (manifest.json): la subida de "
            "los documentos no llegó a completarse. Vuelva a cargar los archivos."
        )
    response.raise_for_status()
    return response.json()


def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not SUPABASE_ARTIFACTS_BASE_URL:
        missing.append("SUPABASE_ARTIFACTS_BASE_URL")
    if not API_BASE_URL:
        missing.append("API_BASE_URL")
    if not API_KEY:
        missing.append("API_KEY")
    if not API_EVENTS_PATH:
        missing.append("API_EVENTS_PATH")
    if not API_PROPOSALS_PATH:
        missing.append("API_PROPOSALS_PATH")
    if not API_ANALYSES_PATH:
        missing.append("API_ANALYSES_PATH")
    if not API_ORIGINAL_FILES_PATH:
        missing.append("API_ORIGINAL_FILES_PATH")
    if not API_JOBS_CALLBACK:
        missing.append("API_JOBS_CALLBACK")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    
    # 1. Create an error event
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)

    # 2. Mark analysis as failed
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")

    # 4. Notify API callback
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def cleanup_previous_run(supabase: Client, slug: str):
    """Remove any data persisted by a previous run of this service."""
    logger.info("Cleanup: removing data from previous runs...")

    # 1. Delete original_files rows for this analysis via API
    try:
        api_request("DELETE", f"{API_ORIGINAL_FILES_PATH}by-analysis/{ANALYSIS_ID}")
        logger.info("Cleanup: original_files deleted via API.")
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.warning(
                "Cleanup: DELETE /original-files/by-analysis/{analysis_id} not implemented in backend (see todo-api.md)."
            )
        else:
            raise

    # 2. Wipe Supabase Storage prefix files/{slug}/
    try:
        listed = supabase.storage.from_("files").list(path=slug)
        paths = [f"{slug}/{item['name']}" for item in (listed or []) if item.get("name")]
        if paths:
            supabase.storage.from_("files").remove(paths)
            logger.info(f"Cleanup: removed {len(paths)} object(s) under storage prefix {slug}/.")
        else:
            logger.info(f"Cleanup: storage prefix {slug}/ is empty.")
    except Exception as e:
        logger.warning(f"Cleanup: storage wipe failed (non-fatal): {e}")


def process_analysis():
    logger.info(f"Starting file extractor for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 2. Fetch the analysis row via API
    logger.info("Fetching analysis via API …")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")

    artifact_path: str = analysis["artifact_path"]
    logger.info(f"Found analysis — status={analysis['status']}, artifact_path={artifact_path}")

    # 2b. Cleanup data from previous runs
    cleanup_previous_run(supabase, analysis["slug"])

    # 3. Update status to 'processing' via API
    logger.info("Updating status to 'processing' …")
    api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "processing"})
    log_event(ANALYSIS_ID, "info", "Inicio de la carga de los documentos", EVENT_SOURCE)

    # 4. Read the batch manifest under the artifact prefix
    base_url = SUPABASE_ARTIFACTS_BASE_URL.rstrip("/")
    prefix = artifact_path.lstrip("/")
    manifest_url = f"{base_url}/{prefix}manifest.json"
    logger.info(f"Downloading manifest from {manifest_url}")
    entries = fetch_manifest(manifest_url)["files"]
    logger.info(f"Manifest lists {len(entries)} file(s)")
    log_event(
        ANALYSIS_ID,
        "info",
        f"Manifiesto del lote recibido: {len(entries)} archivo(s) por procesar",
        EVENT_SOURCE,
        {"total_files": len(entries)},
    )

    # 5. One file at a time: download to disk, validate, upload, index, delete.
    # The temp file is removed before the next one starts, so disk usage stays
    # flat at a single document instead of growing with the whole batch.
    output_dir = WORKSPACE_DIR / ANALYSIS_ID
    output_dir.mkdir(parents=True, exist_ok=True)

    indexed_count = 0
    for index, entry in enumerate(entries):
        file_name = entry["name"]
        # Local name built from the index, never from manifest-supplied text
        local_path = output_dir / f"{index:04d}{Path(file_name).suffix}"
        download_to_disk(f"{base_url}/{prefix}{entry['key']}", local_path)
        try:
            reason = pdf_rejection_reason(local_path)
            if reason:
                logger.warning(f"Skipping non-PDF file {file_name}: {reason}")
                log_event(
                    ANALYSIS_ID,
                    "warning",
                    f"Archivo omitido (no es PDF): {file_name} - {reason}",
                    EVENT_SOURCE,
                    {"file_name": file_name, "reason": reason},
                )
                continue
            upload_and_index_file(supabase, ANALYSIS_ID, analysis["slug"], local_path, file_name)
            indexed_count += 1
        finally:
            local_path.unlink(missing_ok=True)

    # Guard: fail the analysis if no valid PDF remained after skipping
    if not indexed_count:
        raise NoValidPdfError(
            "No se encontró ningún archivo PDF válido para procesar. "
            "Todos los archivos fueron omitidos."
        )

    logger.info(f"Uploaded and indexed {indexed_count} file(s)")
    log_event(
        ANALYSIS_ID,
        "info",
        f"{indexed_count} archivo(s) subidos e indexados correctamente",
        EVENT_SOURCE,
        {"indexed_files": indexed_count},
    )

    logger.info("File extraction complete ✓")
    log_event(ANALYSIS_ID, "info", "Proceso de extracción de archivos finalizado exitosamente", EVENT_SOURCE)

    # 10. Notify API callback on success
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success"
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def main():
    validate_env()
    try:
        process_analysis()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during processing: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except IncompleteBatchError as e:
        notify_failure(str(e))
        sys.exit(0)
    except NoValidPdfError as e:
        notify_failure(str(e))
        sys.exit(0)
    except Exception as e:
        error_msg = f"Failed during processing: {str(e)}"
        notify_failure(error_msg)
        sys.exit(0)


if __name__ == "__main__":
    main()
