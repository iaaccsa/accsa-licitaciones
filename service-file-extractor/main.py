"""
File Extractor Service
======================
Queries Supabase for a specific analysis by ID, downloads the associated
ZIP artifact from Supabase Storage, and extracts it locally.

Required environment variables:
  - SUPABASE_URL           : Supabase project URL
  - SUPABASE_SERVICE_ROLE_KEY : Service role key for authenticated access
  - ANALYSIS_ID            : UUID of the analysis to process
"""

import os
import sys
import uuid
import zipfile
import mimetypes
from pathlib import Path

from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, mark_failed

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = "ACA: service-file-extractor"

logger = setup_logger("file-extractor")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
                    result = (
                        supabase.table("proposals")
                        .insert({
                            "analysis_id": analysis_id,
                            "label": item.name
                        })
                        .execute()
                    )
                    if result.data:
                        proposal_id = result.data[0]["id"]
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

    # 4. Batch insert into 'files' table
    if files_to_insert:
        logger.info(f"Inserting {len(files_to_insert)} file records into DB")
        try:
            supabase.table("files").insert(files_to_insert).execute()
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

    # 2. Fetch the analysis row
    logger.info("Querying analyses table …")
    logger.info("Querying analyses table …")
    result = (
        supabase.table("analyses")
        .select("id, status, artifact_path, slug")
        .eq("id", ANALYSIS_ID)
        .single()
        .execute()
    )

    analysis = result.data
    if not analysis:
        logger.error(f"Analysis {ANALYSIS_ID} not found.")
        sys.exit(1)

    artifact_path: str = analysis["artifact_path"]
    logger.info(f"Found analysis — status={analysis['status']}, artifact_path={artifact_path}")

    # 3. Update status to 'processing'
    logger.info("Updating status to 'processing' …")
    supabase.table("analyses").update({"status": "processing"}).eq("id", ANALYSIS_ID).execute()
    log_event(supabase, ANALYSIS_ID, "info", "Inicio de descompresión de archivos", EVENT_SOURCE)

    # 4. Parse bucket and object path from artifact_path
    #    artifact_path format: "artifacts/<uuid>.zip"  →  bucket = "artifacts", path = "<uuid>.zip"
    #    or it could be "bucket_name/path/to/file.zip"
    parts = artifact_path.split("/", 1)
    if len(parts) != 2:
        error_msg = f"Invalid artifact_path format: {artifact_path}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

    bucket_name, object_path = parts[0], parts[1]
    logger.info(f"Downloading from bucket='{bucket_name}', path='{object_path}'")

    # 5. Download the ZIP from Supabase Storage
    log_event(supabase, ANALYSIS_ID, "info", f"Downloading ZIP from {artifact_path}", EVENT_SOURCE)
    try:
        file_bytes = supabase.storage.from_(bucket_name).download(object_path)
    except Exception as e:
        error_msg = f"Failed to download artifact: {e}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

    # 6. Save ZIP to workspace
    output_dir = WORKSPACE_DIR / ANALYSIS_ID
    output_dir.mkdir(parents=True, exist_ok=True)

    zip_path = output_dir / "source.zip"
    zip_path.write_bytes(file_bytes)
    logger.info(f"ZIP saved to {zip_path} ({len(file_bytes)} bytes)")

    # 7. Extract the ZIP
    log_event(supabase, ANALYSIS_ID, "info", "Extracting ZIP", EVENT_SOURCE)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(output_dir)
            extracted_files = zf.namelist()
        logger.info(f"Extracted {len(extracted_files)} files to {output_dir}")
        log_event(
            supabase,
            ANALYSIS_ID,
            "info",
            f"Extraction complete — {len(extracted_files)} files",
            EVENT_SOURCE,
            {"files": extracted_files},
        )

        # 8. Upload and Index Files
        log_event(supabase, ANALYSIS_ID, "info", "Uploading extracted files to storage", EVENT_SOURCE)
        try:
            upload_and_index_files(supabase, ANALYSIS_ID, analysis["slug"], output_dir)
            log_event(supabase, ANALYSIS_ID, "info", "Files uploaded and indexed successfully", EVENT_SOURCE)
        except Exception as e:
            error_msg = f"Failed during file upload/indexing: {e}"
            logger.error(error_msg)
            mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
            sys.exit(1)
    except zipfile.BadZipFile as e:
        error_msg = f"Invalid ZIP file: {e}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

    # 9. Clean up the ZIP after extraction (optional, saves space)
    zip_path.unlink()
    logger.info("Removed source.zip after extraction")

    logger.info("File extraction complete ✓")
    log_event(supabase, ANALYSIS_ID, "info", "Proceso de extracción de archivos finalizado exitosamente", EVENT_SOURCE)


if __name__ == "__main__":
    main()
