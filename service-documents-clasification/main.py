"""
Documents Classification Service
==================================
Classifies files of an analysis into categories ('tender', 'proposal', 'normative')
using Google Gemini based on each file's previously extracted metadata.
Updates the 'category' field via the backend API (PATCH /api/v1/files/{file_id}).

Required environment variables:
  - GOOGLE_API_KEY         : Google Gemini API key
  - API_BASE_URL           : Backend API base URL
  - API_KEY                : API key for backend authentication
  - API_EVENTS_PATH        : Path for events endpoint
  - API_ANALYSES_PATH      : Path for analyses endpoint
  - API_FILES_PATH         : Path for files endpoint
  - API_PROPOSALS_PATH     : Path for proposals endpoint
  - API_JOBS_CALLBACK      : Path for job status callback
  - ANALYSIS_ID            : UUID of the analysis to process (runtime)
"""

import json
import os
import sys

from google import genai
from google.genai import types as genai_types
import requests
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-documents-clasification"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
GEMINI_MODEL = "gemini-3-flash-preview"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()

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
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
    """Ensure all required environment variables are set."""
    missing = [
        var for var, val in [
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_FILES_PATH", API_FILES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Gemini classification
# ---------------------------------------------------------------------------
CLASSIFICATION_PROMPT = """You are a document classifier specialized in public procurement processes.
Classify this document into exactly one category based on its metadata.

Categories:
- "tender": documents issued by the contracting entity that define the procurement process. Examples: pliegos de condiciones, bases de licitación, términos de referencia, especificaciones técnicas, adendas, aclaraciones oficiales, cronogramas del proceso.
- "proposal": documents submitted by a bidder/vendor as part of their offer. Examples: propuestas técnicas, propuestas económicas, ofertas, cartas de presentación, garantías de seriedad, documentos legales del oferente, estados financieros del oferente.
- "normative": regulatory or legal documents referenced in the process. Examples: leyes, decretos, resoluciones, reglamentos, normas técnicas, certificaciones requeridas por ley.
- "unclassified": use this when the metadata does not contain enough information to determine the document's category with reasonable confidence.

If the metadata is ambiguous but leans toward a category, classify based on the primary purpose of the document. Use "unclassified" only when no reasonable classification can be made.

Return: {{"category": "<tender|proposal|normative|unclassified>"}}

FILE METADATA:
- File name: {file_name}
- Document type: {document_type}
- Company name: {company_name}
- Company role: {company_role}
- Document purpose: {document_purpose}
- Summary: {summary}"""


GROUPING_PROMPT = """You are a document analyst for public procurement processes.
You will receive a list of file metadata entries for documents classified as proposals.
NOTE: You are receiving ONLY metadata (not file contents).

Task: group these files by the entity (company/bidder) they belong to.

Grouping rules:
- Match by company_name (exact or fuzzy match)
- Use tax_id or representative_name as secondary signals
- If metadata is insufficient, place the file in its own group
- Generate a descriptive label for each group (use the company or consortium name when possible)

Return JSON:
{{"groups": [
  {{"label": "Descriptive label", "provider_name": "Company name or null", "file_ids": ["id1", "id2"]}}
]}}

FILE METADATA ENTRIES:
{files_json}"""


NAMING_PROMPT = """You are a document analyst for public procurement processes.
You will receive metadata from tender documents of a procurement process.
NOTE: You are receiving ONLY metadata (not file contents).

Task: generate a short, descriptive name for this procurement process.

Rules:
- The name should identify the procurement process clearly (what is being procured and by whom)
- Keep it concise: 5-15 words maximum
- Use the original language of the documents
- Focus on the contracting entity and the object of the procurement

Return JSON:
{{"generated_name": "Short descriptive name"}}

TENDER FILE METADATA:
{files_json}"""


def classify_file_with_gemini(client: genai.Client, file_record: dict) -> str:
    """Call Gemini to classify a file based on its metadata. Returns category string."""
    metadata = file_record.get("metadata") or {}

    prompt = CLASSIFICATION_PROMPT.format(
        file_name=file_record.get("file_name", "unknown"),
        document_type=metadata.get("document_type", "unknown"),
        company_name=metadata.get("company_name", "unknown"),
        company_role=metadata.get("company_role", "unknown"),
        document_purpose=metadata.get("document_purpose", "unknown"),
        summary=metadata.get("summary", "unknown"),
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    result = json.loads(response.text)
    return result["category"]


def group_proposal_files_with_gemini(client: genai.Client, proposal_files: list[dict]) -> list[dict]:
    """Send only metadata of proposal files to Gemini to group them by company/domain."""
    files_for_prompt = []
    for f in proposal_files:
        metadata = f.get("metadata") or {}
        files_for_prompt.append({
            "id": f["id"],
            "file_name": f.get("file_name", "unknown"),
            "company_name": metadata.get("company_name"),
            "company_role": metadata.get("company_role"),
            "document_purpose": metadata.get("document_purpose"),
            "key_identifiers": metadata.get("key_identifiers"),
            "summary": metadata.get("summary"),
        })

    prompt = GROUPING_PROMPT.format(files_json=json.dumps(files_for_prompt, ensure_ascii=False, indent=2))

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    result = json.loads(response.text)

    # Validate file_ids against known set
    valid_ids = {f["id"] for f in proposal_files}
    groups = result.get("groups", [])
    for group in groups:
        original_ids = group.get("file_ids", [])
        group["file_ids"] = [fid for fid in original_ids if fid in valid_ids]
        invalid = set(original_ids) - valid_ids
        if invalid:
            logger.warning(f"Gemini returned unknown file_ids: {invalid}")

    return groups


def create_proposals_and_update_files(client: genai.Client, files: list[dict]):
    """Group proposal files, create proposal records, and update file proposal_id."""
    proposal_files = [f for f in files if f.get("category") == "proposal" and f.get("metadata")]

    if not proposal_files:
        logger.info("No proposal files to group.")
        return

    logger.info(f"Grouping {len(proposal_files)} proposal files...")
    log_event(ANALYSIS_ID, "info", f"Agrupando {len(proposal_files)} archivos de propuesta.", EVENT_SOURCE)

    groups = group_proposal_files_with_gemini(client, proposal_files)
    logger.info(f"Gemini identified {len(groups)} proposal groups.")

    # Build lookup for link propagation
    file_lookup = {f["id"]: f for f in files}

    proposals_created = 0
    for group in groups:
        label = group.get("label", "Propuesta sin nombre")
        provider_name = group.get("provider_name")
        file_ids = group.get("file_ids", [])

        if not file_ids:
            logger.warning(f"Skipping empty group '{label}'")
            continue

        # Create proposal via API
        proposal = api_request("POST", f"{API_PROPOSALS_PATH}", {
            "analysis_id": ANALYSIS_ID,
            "label": label,
            "provider_name": provider_name,
        })
        proposal_id = proposal["id"]
        logger.info(f"Created proposal '{label}' (id={proposal_id}) with {len(file_ids)} files.")

        # Update each file with proposal_id
        for file_id in file_ids:
            api_request("PATCH", f"{API_FILES_PATH}{file_id}", {"proposal_id": proposal_id})

            # Propagate to linked source file
            file_record = file_lookup.get(file_id)
            link_id = file_record.get("link") if file_record else None
            if link_id:
                api_request("PATCH", f"{API_FILES_PATH}{link_id}", {"proposal_id": proposal_id})
                logger.info(f"Propagated proposal_id to linked file {link_id}")

        log_event(ANALYSIS_ID, "info", f"Propuesta '{label}' creada con {len(file_ids)} archivos.", EVENT_SOURCE)
        proposals_created += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Se crearon {proposals_created} propuestas a partir de {len(proposal_files)} archivos de propuesta.",
        EVENT_SOURCE,
    )
    logger.info(f"Proposal grouping complete — {proposals_created} proposals created.")


def generate_analysis_name(client: genai.Client, files: list[dict]):
    """Generate a descriptive name for the analysis using tender file metadata."""
    tender_files = [
        f for f in files
        if f.get("category") == "tender" and f.get("is_processed_version") is True and f.get("metadata")
    ]

    if not tender_files:
        logger.info("No processed tender files available — skipping analysis name generation.")
        return

    logger.info(f"Generating analysis name from {len(tender_files)} tender files...")

    files_for_prompt = []
    for f in tender_files:
        metadata = f.get("metadata") or {}
        files_for_prompt.append({
            "file_name": f.get("file_name", "unknown"),
            "document_type": metadata.get("document_type"),
            "company_name": metadata.get("company_name"),
            "company_role": metadata.get("company_role"),
            "document_purpose": metadata.get("document_purpose"),
            "key_identifiers": metadata.get("key_identifiers"),
            "summary": metadata.get("summary"),
        })

    prompt = NAMING_PROMPT.format(files_json=json.dumps(files_for_prompt, ensure_ascii=False, indent=2))

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    result = json.loads(response.text)
    generated_name = result.get("generated_name", "").strip()

    if not generated_name:
        logger.warning("Gemini returned empty generated_name.")
        return

    api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}", {"generated_name": generated_name})
    logger.info(f"Analysis name set to: '{generated_name}'")
    log_event(ANALYSIS_ID, "info", f"Nombre del análisis generado: '{generated_name}'.", EVENT_SOURCE)


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


def process_documents_classification():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}")

    # 1. Fetch all files for this analysis
    files = api_request("POST", f"{API_FILES_PATH}search", {"analysis_id": ANALYSIS_ID})

    if not files:
        logger.warning("No files found for this analysis.")
        log_event(ANALYSIS_ID, "warning", "No se encontraron archivos para clasificar.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    logger.info(f"Found {len(files)} files to classify.")
    log_event(ANALYSIS_ID, "info", f"Clasificando {len(files)} archivos.", EVENT_SOURCE)

    # 2. Classify each file using Gemini
    gemini = genai.Client(api_key=GOOGLE_API_KEY)
    classified = 0
    skipped = 0

    for file_record in files:
        file_id = file_record["id"]
        file_name = file_record.get("file_name", "unknown")

        if not file_record.get("metadata"):
            logger.warning(f"Skipping '{file_name}' — no metadata available.")
            skipped += 1
            continue

        try:
            category = classify_file_with_gemini(gemini, file_record)
            if category == "unclassified":
                logger.warning(f"Could not classify '{file_name}' — marked as 'unclassified'")
            else:
                logger.info(f"Classified '{file_name}' as '{category}'")

            # Track category locally for the grouping phase
            file_record["category"] = category

            # 3. Update file category via API
            api_request("PATCH", f"{API_FILES_PATH}{file_id}", {"category": category})
            log_event(ANALYSIS_ID, "info", f"Archivo '{file_name}' clasificado como '{category}'.", EVENT_SOURCE)

            # 4. Propagate category to the linked source file (if any)
            link_id = file_record.get("link")
            if link_id:
                api_request("PATCH", f"{API_FILES_PATH}{link_id}", {"category": category})
                logger.info(f"Propagated '{category}' to linked file {link_id}")
                log_event(ANALYSIS_ID, "info", f"Categoria '{category}' propagada al archivo original (link={link_id}).", EVENT_SOURCE)

            classified += 1

        except Exception as e:
            logger.error(f"Failed to classify '{file_name}': {e}")
            log_event(ANALYSIS_ID, "warning", f"Error al clasificar '{file_name}': {e}", EVENT_SOURCE)
            skipped += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Clasificacion completada: {classified} clasificados, {skipped} omitidos.",
        EVENT_SOURCE,
    )
    logger.info(f"{SERVICE_NAME} complete — {classified} classified, {skipped} skipped.")

    # 5. Group proposal files and create proposal records
    create_proposals_and_update_files(gemini, files)

    # 6. Generate analysis name from tender metadata
    generate_analysis_name(gemini, files)

    # 7. Notify success callback
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "status": "success",
    })


def main():
    validate_env()
    try:
        process_documents_classification()
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
