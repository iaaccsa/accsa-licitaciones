"""
File Extractor Service
======================
Queries the backend API for a specific analysis by ID, downloads the associated
ZIP artifact, extracts it, and uploads files to Supabase Storage.

Required environment variables:
  - SUPABASE_URL               : Supabase project URL
  - SUPABASE_SERVICE_ROLE_KEY  : Service role key for authenticated access
  - SUPABASE_ARTIFACTS_BASE_URL: Base URL for artifact downloads
  - API_BASE_URL               : Backend API base URL
  - API_KEY                    : API key for backend authentication
  - API_EVENTS_PATH            : Path for events endpoint
  - API_PROPOSALS_PATH         : Path for proposals endpoint
  - API_ANALYSES_PATH          : Path for analyses endpoint
  - API_FILES_PATH             : Path for files endpoint
  - API_WORKFLOW_STEPS_PATH    : Path for workflow steps endpoint
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
from supabase_logger import setup_logger, log_event, mark_failed, log_workflow_step

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ARTIFACTS_BASE_URL = os.environ.get("SUPABASE_ARTIFACTS_BASE_URL")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH")
API_WORKFLOW_STEPS_PATH = os.environ.get("API_WORKFLOW_STEPS_PATH")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")


WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = "ACA: service-file-extractor"

logger = setup_logger("file-extractor")

# ---------------------------------------------------------------------------
# Workflow Steps Data
# ---------------------------------------------------------------------------

WORKFLOW_CODE = "extractor"
WORKFLOW_DISPLAY_NAME = "Extracción de archivos"
WORKFLOW_PARENT_CODE = "queued"

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
    response = requests.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    return response.json()


def determine_file_category(relative_path: Path) -> str:
    """
    Determine category based on folder structure.
    Returns 'proposal' if path contains 'oferta'/'proposal',
    otherwise defaults to 'tender'.
    """
    path_str = str(relative_path).lower()
    if "oferta" in path_str or "propuesta" in path_str or "proposal" in path_str:
        return "proposal"
    return "tender"


def upload_and_index_files(supabase: Client, analysis_id: str, slug: str, root_dir: Path):
    """
    Walk through the extracted files, upload them to 'files' bucket,
    and insert records into 'files' table.
    Target path: files/<slug>/<relative_path>
    
    Logic for proposals:
    - Iterate through immediate subdirectories of root_dir.
    - If folder name is NOT 'tender':
      - Create a record in 'proposals' table with label=folder_name, analysis_id.
      - Use the returned proposal_id for all files within this folder.
    - If folder name IS 'tender' (or files in root), proposal_id is None.
    """
    logger.info(f"Starting file upload and indexing for slug={slug}")

    # 1. Identify proposals (folders in root that are not 'tender')
    # and create them in DB to get their IDs.
    proposal_map = {}  # folder_name -> proposal_id

    for item in root_dir.iterdir():
        if item.is_dir():
            folder_name = item.name.lower()
            # If it's not the 'tender' folder, treat it as a proposal
            if folder_name != "tender":
                try:
                    logger.info(f"Creating proposal for folder: {item.name}")
                    result = api_request("POST", API_PROPOSALS_PATH, {
                        "analysis_id": analysis_id,
                        "label": item.name
                    })
                    proposal_id = result["id"]
                    proposal_map[item.name] = proposal_id
                    logger.info(f"Created proposal '{item.name}' with id={proposal_id}")
                except Exception as e:
                    logger.error(f"Failed to create proposal for folder {item.name}: {e}")
                    raise e

    files_to_insert = []

    for current_root, _, files in os.walk(root_dir):
        for filename in files:
            # Skip the source zip to avoid re-uploading
            if filename == "source.zip":
                continue

            file_path = Path(current_root) / filename
            relative_path = file_path.relative_to(root_dir)

            # Determine if this file belongs to a proposal
            # Check the first part of the relative path
            parts = relative_path.parts
            proposal_id = None
            
            if len(parts) > 1:
                top_folder = parts[0]
                # If this top folder matches one of our created proposals, assign ID
                if top_folder in proposal_map:
                    proposal_id = proposal_map[top_folder]

            # 1. Determine storage path
            # Generate UUID for the file storage keys
            file_id = str(uuid.uuid4())

            # Preserve folder structure but use UUID filename
            parent_dir = relative_path.parent
            if str(parent_dir) == ".":
                storage_object_name = f"{file_id}{file_path.suffix}"
            else:
                storage_object_name = f"{parent_dir}/{file_id}{file_path.suffix}"

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
            # If it has a proposal_id, it is a 'proposal', otherwise 'tender'
            # (or use the existing helper logic if strictly needed, but proposal_id implies category='proposal')
            category = "proposal" if proposal_id else "tender"

            file_record = {
                "id": file_id,
                "analysis_id": analysis_id,
                "file_name": filename,
                "storage_path": storage_path,
                "category": category,
                "file_size": file_stat.st_size,
                "mime_type": mime_type,
                "is_processed_version": False
            }
            
            if proposal_id:
                file_record["proposal_id"] = proposal_id

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
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
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
    if not API_WORKFLOW_STEPS_PATH:
        missing.append("API_WORKFLOW_STEPS_PATH")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def main():
    validate_env()

    logger.info(f"Starting file extractor for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    log_workflow_step(
        analysis_id=ANALYSIS_ID,
        proposal_id=None,
        code=WORKFLOW_CODE,
        display_name=WORKFLOW_DISPLAY_NAME,
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
        parent_code=WORKFLOW_PARENT_CODE
    )

    # 2. Fetch the analysis row via API
    logger.info("Fetching analysis via API …")
    try:
        analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.error(f"Analysis {ANALYSIS_ID} not found.")
        else:
            logger.error(f"Failed to fetch analysis: {e}")
        sys.exit(1)

    artifact_path: str = analysis["artifact_path"]
    logger.info(f"Found analysis — status={analysis['status']}, artifact_path={artifact_path}")

    # 3. Update status to 'processing' via API
    logger.info("Updating status to 'processing' …")
    api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "processing"})
    log_event(ANALYSIS_ID, "info", "Inicio de descompresión de archivos", EVENT_SOURCE)

    # 4. Download the ZIP via HTTP from SUPABASE_ARTIFACTS_BASE_URL + artifact_path
    download_url = f"{SUPABASE_ARTIFACTS_BASE_URL}/{artifact_path}"
    logger.info(f"Downloading ZIP from {download_url}")
    log_event(ANALYSIS_ID, "info", f"Downloading ZIP from {download_url}", EVENT_SOURCE)
    try:
        response = requests.get(download_url, timeout=300)
        response.raise_for_status()
        file_bytes = response.content
    except Exception as e:
        error_msg = f"Failed to download artifact: {e}"
        logger.error(error_msg)
        mark_failed(ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

    # 6. Save ZIP to workspace
    output_dir = WORKSPACE_DIR / ANALYSIS_ID
    output_dir.mkdir(parents=True, exist_ok=True)

    zip_path = output_dir / "source.zip"
    zip_path.write_bytes(file_bytes)
    logger.info(f"ZIP saved to {zip_path} ({len(file_bytes)} bytes)")

    # 7. Extract the ZIP
    log_event(ANALYSIS_ID, "info", "Extracting ZIP", EVENT_SOURCE)
    try:
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
        try:
            upload_and_index_files(supabase, ANALYSIS_ID, analysis["slug"], output_dir)
            log_event(ANALYSIS_ID, "info", "Files uploaded and indexed successfully", EVENT_SOURCE)
        except Exception as e:
            error_msg = f"Failed during file upload/indexing: {e}"
            logger.error(error_msg)
            mark_failed(ANALYSIS_ID, error_msg, EVENT_SOURCE)
            sys.exit(1)
    except zipfile.BadZipFile as e:
        error_msg = f"Invalid ZIP file: {e}"
        logger.error(error_msg)
        mark_failed(ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

    # 9. Clean up the ZIP after extraction (optional, saves space)
    zip_path.unlink()
    logger.info("Removed source.zip after extraction")

    logger.info("File extraction complete ✓")
    log_event(ANALYSIS_ID, "info", "Proceso de extracción de archivos finalizado exitosamente", EVENT_SOURCE)


if __name__ == "__main__":
    main()
