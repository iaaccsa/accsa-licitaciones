"""
File Extractor Service
======================
Queries the backend API for a specific analysis by ID, downloads the associated
ZIP artifact, extracts it, and uploads files to Supabase Storage.

Required environment variables:
  - SUPABASE_URL               : Supabase project URL
  - SUPABASE_SERVICE_KEY  : Service role key for authenticated access
  - SUPABASE_ARTIFACTS_BASE_URL: Base URL for artifact downloads
  - API_BASE_URL               : Backend API base URL
  - API_KEY                    : API key for backend authentication
  - API_EVENTS_PATH            : Path for events endpoint
  - API_PROPOSALS_PATH         : Path for proposals endpoint
  - API_ANALYSES_PATH          : Path for analyses endpoint
  - API_FILES_PATH             : Path for files endpoint
  - ANALYSIS_ID                : UUID of the analysis to process
"""

import os
import sys
import uuid
import zipfile
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
API_FILES_PATH = os.environ.get("API_FILES_PATH")
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


def upload_and_index_files(supabase: Client, analysis_id: str, slug: str, root_dir: Path):
    """
    Walk through the extracted files, upload them to 'files' bucket,
    and insert records into 'files' table.
    Target path: files/<slug>/<file_id><suffix>
    
    Files are no longer organized in folders, so they are directly in the zip
    and associated directly with the analysis_id under the 'tender' category.
    """
    logger.info(f"Starting file upload and indexing for slug={slug}")

    files_to_insert = []

    for current_root, _, files in os.walk(root_dir):
        for filename in files:
            # Skip the source zip to avoid re-uploading
            if filename == "source.zip":
                continue

            file_path = Path(current_root) / filename

            # 1. Determine storage path
            # Generate UUID for the file storage keys
            file_id = str(uuid.uuid4())

            # Since files are at root, no parent dir logic is required, just use root
            storage_object_name = f"{file_id}{file_path.suffix}"
            storage_path = f"{slug}/{storage_object_name}"

            # 2. Upload to Supabase Storage ('files' bucket)
            try:
                # Get MIME type
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    mime_type = "application/octet-stream"

                with open(file_path, "rb") as f:
                    supabase.storage.from_("files").upload(
                        path=storage_path,
                        file=f,
                        file_options={"content-type": mime_type}
                    )
            except Exception as e:
                logger.error(f"Failed to upload {filename}: {e}")
                raise e

            # 3. Prepare DB record
            file_stat = file_path.stat()

            file_record = {
                "id": file_id,
                "analysis_id": analysis_id,
                "file_name": filename,
                "storage_path": storage_path,
                "category": None,
                "file_size": file_stat.st_size,
                "mime_type": mime_type,
                "is_processed_version": False
            }

            files_to_insert.append(file_record)

    # 4. Insert file records via API
    if files_to_insert:
        logger.info(f"Inserting {len(files_to_insert)} file records via API")
        try:
            for file_record in files_to_insert:
                api_request("POST", API_FILES_PATH, file_record)
        except Exception as e:
            logger.error(f"Failed to insert file records: {e}")
            raise e

    logger.info("File upload and indexing complete.")


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
    if not API_FILES_PATH:
        missing.append("API_FILES_PATH")
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


def process_analysis():
    logger.info(f"Starting file extractor for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 2. Fetch the analysis row via API
    logger.info("Fetching analysis via API …")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")

    artifact_path: str = analysis["artifact_path"]
    logger.info(f"Found analysis — status={analysis['status']}, artifact_path={artifact_path}")

    # 3. Update status to 'processing' via API
    logger.info("Updating status to 'processing' …")
    api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "processing"})
    log_event(ANALYSIS_ID, "info", "Inicio de descompresión de archivos", EVENT_SOURCE)

    # 4. Download the ZIP via HTTP from SUPABASE_ARTIFACTS_BASE_URL + artifact_path
    download_url = f"{SUPABASE_ARTIFACTS_BASE_URL.rstrip('/')}/{artifact_path.lstrip('/')}"
    logger.info(f"Downloading ZIP from {download_url}")
    log_event(ANALYSIS_ID, "info", f"Downloading ZIP from {download_url}", EVENT_SOURCE)
    
    response = requests.get(download_url, timeout=300)
    response.raise_for_status()
    file_bytes = response.content

    # 6. Save ZIP to workspace
    output_dir = WORKSPACE_DIR / ANALYSIS_ID
    output_dir.mkdir(parents=True, exist_ok=True)

    zip_path = output_dir / "source.zip"
    zip_path.write_bytes(file_bytes)
    logger.info(f"ZIP saved to {zip_path} ({len(file_bytes)} bytes)")

    # 7. Extract the ZIP
    log_event(ANALYSIS_ID, "info", "Extracting ZIP", EVENT_SOURCE)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(output_dir)
        extracted_files = zf.namelist()
    logger.info(f"Extracted {len(extracted_files)} files to {output_dir}")
    log_event(
        ANALYSIS_ID,
        "info",
        f"Extraction complete — {len(extracted_files)} files",
        EVENT_SOURCE,
        {"files": extracted_files},
    )

    # 8. Upload and Index Files
    log_event(ANALYSIS_ID, "info", "Uploading extracted files to storage", EVENT_SOURCE)
    upload_and_index_files(supabase, ANALYSIS_ID, analysis["slug"], output_dir)
    log_event(ANALYSIS_ID, "info", "Files uploaded and indexed successfully", EVENT_SOURCE)

    # 9. Clean up the ZIP after extraction (optional, saves space)
    zip_path.unlink()
    logger.info("Removed source.zip after extraction")

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
    except zipfile.BadZipFile as e:
        error_msg = f"Invalid ZIP file: {e}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        error_msg = f"Failed during processing: {str(e)}"
        notify_failure(error_msg)
        sys.exit(0)


if __name__ == "__main__":
    main()
