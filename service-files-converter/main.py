"""
Files Converter Service
=======================
Downloads tender files from Supabase Storage for a given analysis_id,
converts each to Markdown using LlamaParse, uploads individual .md files
and a combined tender.md back to Supabase Storage.

Required environment variables:
  - SUPABASE_URL              : Supabase project URL
  - SUPABASE_SERVICE_KEY      : Service role key for authenticated access
  - LLAMA_CLOUD_API_KEY       : LlamaCloud API key for LlamaParse
  - API_BASE_URL              : Backend API base URL
  - API_KEY                   : API key for backend authentication
  - API_EVENTS_PATH           : Path for events endpoint
  - API_FILES_PATH            : Path for files endpoint (optional, default: /api/v1/files/)
  - API_ANALYSES_PATH         : Path for analyses endpoint (optional, default: /api/v1/analyses/)
  - API_PROPOSALS_PATH        : Path for proposals endpoint (optional, default: /api/v1/proposals/)
  - API_JOBS_CALLBACK         : Path for job completion callback endpoint
  - ANALYSIS_ID               : UUID of the analysis to process
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
import nest_asyncio
from llama_parse import LlamaParse
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, make_session

# Allow nested event loops (required by LlamaParse)
nest_asyncio.apply()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
LLAMA_CLOUD_API_KEY = os.environ.get("LLAMA_CLOUD_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH", "/api/v1/files/")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH", "/api/v1/analyses/")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH", "/api/v1/proposals/")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-files-converter"
WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
STORAGE_BUCKET = "files"

logger = setup_logger("files-converter")
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
    if not LLAMA_CLOUD_API_KEY:
        missing.append("LLAMA_CLOUD_API_KEY")
    if not API_BASE_URL:
        missing.append("API_BASE_URL")
    if not API_KEY:
        missing.append("API_KEY")
    if not API_EVENTS_PATH:
        missing.append("API_EVENTS_PATH")
    if not API_JOBS_CALLBACK:
        missing.append("API_JOBS_CALLBACK")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def get_parser() -> LlamaParse:
    """Initialize and return the LlamaParse instance."""
    return LlamaParse(
        api_key=LLAMA_CLOUD_API_KEY,
        result_type="markdown",
        verbose=True,
        language="es",
        system_prompt=(
            "This is a technical tender document or proposal. "
            "Preserve all tables strictly in markdown format. "
            "Extract headers and subheaders clearly."
        ),
    )


def parse_file(parser: LlamaParse, file_path: str) -> str:
    """Parse a single file and return its Markdown content."""
    logger.info(f"Parsing file: {file_path} ...")
    documents = parser.load_data(file_path)
    return "\n\n".join([doc.text for doc in documents])


def upload_markdown(
    supabase: Client,
    analysis_id: str,
    slug: str,
    file_name: str,
    content: str,
    is_combined: bool = False,
    is_merged: bool = False,
    proposal_id: str | None = None,
    custom_storage_path: str | None = None,
    folder_path: str | None = None,
) -> dict:
    """
    Upload a Markdown string to Supabase Storage and insert a record
    via the backend API.

    Returns the inserted file record dict.
    """
    file_id = str(uuid.uuid4())

    if custom_storage_path:
        storage_path = custom_storage_path
    elif folder_path:
        storage_path = f"{folder_path}/{file_id}.md"
    elif is_combined:
        storage_path = f"{slug}/tender/tender_full.md"
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
        "id": file_id,
        "analysis_id": analysis_id,
        "file_name": file_name,
        "storage_path": storage_path,
        "category": "proposal" if proposal_id else "tender",
        "file_size": len(content_bytes),
        "mime_type": "text/markdown",
        "is_processed_version": True,
        "is_merged": is_merged,
    }

    if proposal_id:
        record["proposal_id"] = proposal_id

    api_request("POST", API_FILES_PATH, record)
    logger.info(f"Inserted file record via API: {file_name} (id={file_id})")

    return record


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "failed"})
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
    logger.info(f"Starting tender ingestor for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase (only for Storage operations)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 2. Fetch the analysis to get the slug via API
    logger.info("Fetching analysis via API …")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")

    slug = analysis["slug"].strip()
    logger.info(f"Found analysis — slug={slug}")
    log_event(ANALYSIS_ID, "info", "Inicio de conversion de archivos", EVENT_SOURCE)

    # -----------------------------------------------------------------------
    # A. Process TENDER files
    # -----------------------------------------------------------------------
    logger.info("Querying files via API for tender documents …")
    all_files = api_request("POST", f"{API_FILES_PATH}search", {"analysis_id": ANALYSIS_ID})
    tender_files = [
        f for f in all_files
        if f.get("category") == "tender" and not f.get("is_processed_version")
    ]

    if tender_files:
        logger.info(f"Found {len(tender_files)} tender file(s) to process")
        log_event(
            ANALYSIS_ID,
            "info",
            f"Encontrados {len(tender_files)} archivos tender",
            EVENT_SOURCE,
            {"files": [f["file_name"] for f in tender_files]},
        )

        # Initialize LlamaParse
        parser = get_parser()

        all_sections = []
        work_dir = WORKSPACE_DIR / ANALYSIS_ID / "tender"
        work_dir.mkdir(parents=True, exist_ok=True)

        for idx, file_record in enumerate(tender_files, 1):
            file_name = file_record["file_name"]
            storage_path = file_record["storage_path"]
            
            logger.info(f"[TENDER] [{idx}/{len(tender_files)}] Processing: {file_name}")
            
            # Download
            try:
                file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
            except Exception as e:
                logger.error(f"Failed to download {file_name}: {e}")
                continue # Skip failing file instead of exiting

            # Save local
            local_path = work_dir / file_name
            local_path.write_bytes(file_bytes)

            # Parse
            try:
                md_content = parse_file(parser, str(local_path))
            except Exception as e:
                logger.error(f"Failed to parse {file_name}: {e}")
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
                    is_combined=False,
                    is_merged=False,
                    folder_path=original_folder
                )
            except Exception as e:
                logger.error(f"Failed to upload {md_file_name}: {e}")
                
            # Collect for combined
            section = f"\n\n# --- DOCUMENT START: {file_name} ---\n\n{md_content}\n"
            all_sections.append(section)

            # Cleanup
            local_path.unlink(missing_ok=True)

        # Build and upload combined tender.md
        if all_sections:
            logger.info("Building combined tender_full.md …")
            combined_markdown = "".join(all_sections)
            try:
                upload_markdown(
                    supabase,
                    ANALYSIS_ID,
                    slug,
                    "tender_full.md",
                    combined_markdown,
                    is_combined=True,
                    is_merged=True,
                    proposal_id=None
                )
            except Exception as e:
                logger.error(f"Failed to upload tender_full.md: {e}")

    # -----------------------------------------------------------------------
    # B. Process PROPOSALS
    # -----------------------------------------------------------------------
    logger.info("Querying proposals via API …")
    proposals = api_request("POST", f"{API_PROPOSALS_PATH}search", {"analysis_id": ANALYSIS_ID})

    if proposals:
        logger.info(f"Found {len(proposals)} proposal(s) to process")

        parser = get_parser()

        # Fetch all proposal files once and filter per proposal
        proposal_files_all = [
            f for f in all_files
            if f.get("category") == "proposal" and not f.get("is_processed_version")
        ]

        for p_idx, proposal in enumerate(proposals, 1):
            proposal_id = proposal["id"]
            proposal_label = proposal["label"]

            logger.info(f"Processing proposal [{p_idx}/{len(proposals)}]: {proposal_label} ({proposal_id})")

            # Filter files for this proposal
            p_files = [f for f in proposal_files_all if f.get("proposal_id") == proposal_id]

            if not p_files:
                logger.info(f"No files found for proposal {proposal_label}")
                continue

            log_event(
                ANALYSIS_ID,
                "info",
                f"Procesando propuesta: {proposal_label}",
                EVENT_SOURCE,
                {"files": [f["file_name"] for f in p_files]}
            )
            
            p_all_sections = []
            p_work_dir = WORKSPACE_DIR / ANALYSIS_ID / f"proposal_{proposal_id}"
            p_work_dir.mkdir(parents=True, exist_ok=True)
            
            for f_idx, file_record in enumerate(p_files, 1):
                file_name = file_record["file_name"]
                storage_path = file_record["storage_path"]
                
                logger.info(f"[PROPOSAL] [{f_idx}/{len(p_files)}] Processing: {file_name}")
                
                 # Download
                try:
                    file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
                except Exception as e:
                    logger.error(f"Failed to download {file_name}: {e}")
                    continue

                # Save local
                local_path = p_work_dir / file_name
                local_path.write_bytes(file_bytes)

                # Parse
                try:
                    md_content = parse_file(parser, str(local_path))
                except Exception as e:
                    logger.error(f"Failed to parse {file_name}: {e}")
                    continue

                # Upload individual .md
                md_file_name = Path(file_name).stem + ".md"
                # Extract folder path
                original_folder = str(Path(storage_path).parent)

                try:
                    upload_markdown(
                        supabase,
                        ANALYSIS_ID,
                        slug,
                        md_file_name,
                        md_content,
                        is_combined=False,
                        is_merged=False,
                        proposal_id=proposal_id,
                        folder_path=original_folder
                    )
                except Exception as e:
                    logger.error(f"Failed to upload {md_file_name}: {e}")

                # Collect for combined
                section = f"\n\n# --- DOCUMENT START: {file_name} ---\n\n{md_content}\n"
                p_all_sections.append(section)

                # Cleanup
                local_path.unlink(missing_ok=True)
            
            # Build and upload combined proposal_full.md for this proposal
            if p_all_sections:
                logger.info(f"Building combined proposal_full.md for {proposal_label} …")
                combined_markdown = "".join(p_all_sections)
                
                # Path: <slug>/<proposal_label>/proposal_full.md
                custom_path = f"{slug}/{proposal_label}/proposal_full.md"
                
                try:
                    upload_markdown(
                        supabase,
                        ANALYSIS_ID,
                        slug,
                        "proposal_full.md",
                        combined_markdown,
                        is_combined=False, # We provide custom path
                        is_merged=True,
                        proposal_id=proposal_id,
                        custom_storage_path=custom_path
                    )
                except Exception as e:
                    logger.error(f"Failed to upload merged file for proposal {proposal_label}: {e}")

    log_event(ANALYSIS_ID, "info", "Conversion de archivos completada", EVENT_SOURCE)

    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success"
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")

    logger.info("Files conversion service complete ✓")


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
