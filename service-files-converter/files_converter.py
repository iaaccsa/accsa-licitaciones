"""
Files Converter Service
=======================
Downloads tender files from Supabase Storage for a given analysis_id,
converts each to Markdown using LlamaParse, uploads individual .md files
and a combined tender.md back to Supabase Storage.

Required environment variables:
  - SUPABASE_URL              : Supabase project URL
  - SUPABASE_SERVICE_ROLE_KEY : Service role key for authenticated access
  - ANALYSIS_ID               : UUID of the analysis to process
  - LLAMA_CLOUD_API_KEY       : LlamaCloud API key for LlamaParse
"""

import os
import sys
import uuid
from pathlib import Path

import nest_asyncio
from llama_parse import LlamaParse
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, mark_failed

# Allow nested event loops (required by LlamaParse)
nest_asyncio.apply()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
LLAMA_CLOUD_API_KEY = os.environ.get("LLAMA_CLOUD_API_KEY")

WORKSPACE_DIR = Path("/app/workspace")
EVENT_SOURCE = "ACA: service-files-converter"
STORAGE_BUCKET = "files"

logger = setup_logger("files-converter")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if not LLAMA_CLOUD_API_KEY:
        missing.append("LLAMA_CLOUD_API_KEY")
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
    into the files table.

    Returns the inserted file record dict.
    """
    file_id = str(uuid.uuid4())

    if custom_storage_path:
        storage_path = custom_storage_path
    elif folder_path:
        # Preserve folder structure: <folder_path>/<file_id>.md
        # folder_path already includes slug if derived from storage_path
        storage_path = f"{folder_path}/{file_id}.md"
    elif is_combined:
        # Combined file goes at: <slug>/tender/tender_full.md
        storage_path = f"{slug}/tender/tender_full.md"
    else:
        # Fallback (shouldn't be reached if logic is correct): <slug>/<file_id>.md
        storage_path = f"{slug}/{file_id}.md"

    content_bytes = content.encode("utf-8")

    # Upload to storage
    supabase.storage.from_(STORAGE_BUCKET).upload(
        path=storage_path,
        file=content_bytes,
        file_options={"content-type": "text/markdown"},
    )
    logger.info(f"Uploaded {storage_path} ({len(content_bytes)} bytes)")

    # Insert DB record
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

    supabase.table("files").insert(record).execute()
    logger.info(f"Inserted file record: {file_name} (id={file_id})")

    return record


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def main():
    validate_env()

    logger.info(f"Starting tender ingestor for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    # 2. Fetch the analysis to get the slug
    logger.info("Querying analyses table …")
    result = (
        supabase.table("analyses")
        .select("id, slug")
        .eq("id", ANALYSIS_ID)
        .single()
        .execute()
    )

    analysis = result.data
    if not analysis:
        logger.error(f"Analysis {ANALYSIS_ID} not found.")
        sys.exit(1)

    slug = analysis["slug"].strip()
    logger.info(f"Found analysis — slug={slug}")
    log_event(supabase, ANALYSIS_ID, "info", "Inicio de conversion de archivos", EVENT_SOURCE)

    # -----------------------------------------------------------------------
    # A. Process TENDER files
    # -----------------------------------------------------------------------
    logger.info("Querying files table for tender documents …")
    files_result = (
        supabase.table("files")
        .select("id, file_name, storage_path")
        .eq("analysis_id", ANALYSIS_ID)
        .eq("category", "tender")
        .eq("is_processed_version", False)
        .execute()
    )

    tender_files = files_result.data or []
    
    if tender_files:
        logger.info(f"Found {len(tender_files)} tender file(s) to process")
        log_event(
            supabase,
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
    logger.info("Querying proposals table …")
    proposals_result = (
        supabase.table("proposals")
        .select("id, label")
        .eq("analysis_id", ANALYSIS_ID)
        .execute()
    )
    proposals = proposals_result.data or []
    
    if proposals:
        logger.info(f"Found {len(proposals)} proposal(s) to process")
        
        parser = get_parser() # Reuse or create new instance
        
        for p_idx, proposal in enumerate(proposals, 1):
            proposal_id = proposal["id"]
            proposal_label = proposal["label"]
            
            logger.info(f"Processing proposal [{p_idx}/{len(proposals)}]: {proposal_label} ({proposal_id})")
            
            # Fetch files for this proposal
            p_files_result = (
                supabase.table("files")
                .select("id, file_name, storage_path")
                .eq("analysis_id", ANALYSIS_ID)
                .eq("category", "proposal")
                .eq("proposal_id", proposal_id)
                .eq("is_processed_version", False)
                .execute()
            )
            p_files = p_files_result.data or []
            
            if not p_files:
                logger.info(f"No files found for proposal {proposal_label}")
                continue
                
            log_event(
                supabase, 
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

    log_event(
        supabase,
        ANALYSIS_ID,
        "info",
        "Conversion de archivos completada",
        EVENT_SOURCE
    )

    logger.info("Files conversion service complete ✓")


if __name__ == "__main__":
    main()
