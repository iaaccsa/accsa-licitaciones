"""
Documents Grouper Service
===========================
Groups already-classified files of an analysis into proposals and a tender record.
Uses OpenAI (Gemini fallback) to group proposal files by company/bidder, generate a
descriptive name for the procurement process, and identify the contracting entity.

Required environment variables:
  - OPENAI_API_KEY         : OpenAI API key (primary model)
  - GOOGLE_API_KEY         : Google Gemini API key (fallback model)
  - API_BASE_URL           : Backend API base URL
  - API_KEY                : API key for backend authentication
  - API_EVENTS_PATH        : Path for events endpoint
  - API_ANALYSES_PATH      : Path for analyses endpoint
  - API_PROCESSED_FILES_PATH : Path for processed files endpoint
  - API_ORIGINAL_FILES_PATH  : Path for original files endpoint (propagation)
  - API_PROPOSALS_PATH     : Path for proposals endpoint
  - API_TENDERS_PATH       : Path for tenders endpoint
  - API_JOBS_CALLBACK      : Path for job status callback
  - ANALYSIS_ID            : UUID of the analysis to process (runtime)
"""

import json
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types as genai_types
from openai import OpenAI
import requests
from supabase_logger import setup_logger, log_event, make_session
from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_ORIGINAL_FILES_PATH = os.environ.get("API_ORIGINAL_FILES_PATH")
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_TENDERS_PATH = os.environ.get("API_TENDERS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-documents-grouper"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
OPENAI_MODEL = "gpt-4.1-mini"
GEMINI_FALLBACK_MODEL = "gemini-3.1-pro-preview"

# Model selection, resolved at runtime from the analysis (see resolve_model_config).
# Defaults preserve the prior hardcoded behavior if the API is unreachable.
PRIMARY_PROVIDER = "openai"
PRIMARY_MODEL = OPENAI_MODEL
FALLBACK_PROVIDER = "gemini"
FALLBACK_MODEL = GEMINI_FALLBACK_MODEL

# AI cost accounting: frozen price snapshot, loaded once in main().
PRICING: dict = {}


def _provider_of(model_id: str) -> str:
    return "gemini" if str(model_id).startswith("gemini") else "openai"


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
    response = SESSION.request(
        method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def resolve_model_config():
    """Resolve the LLM model for this analysis from the API (global config snapshot)
    and log a startup event. On any failure keep the hardcoded defaults."""
    global PRIMARY_PROVIDER, PRIMARY_MODEL, FALLBACK_PROVIDER, FALLBACK_MODEL
    level = None
    origin = "configuracion global"
    try:
        cfg = api_request("GET", f"{API_ANALYSES_PATH}/{ANALYSIS_ID}/model-config")
        if cfg:
            PRIMARY_PROVIDER = cfg.get("provider") or PRIMARY_PROVIDER
            PRIMARY_MODEL = cfg.get("model_id") or PRIMARY_MODEL
            level = cfg.get("level")
            fb = cfg.get("fallback_model_id")
            if fb:
                FALLBACK_MODEL = fb
                FALLBACK_PROVIDER = _provider_of(fb)
    except Exception as e:
        origin = f"valores por defecto (model-config no disponible: {e})"
    msg = (
        f"Modelo LLM: {PRIMARY_MODEL} (proveedor {PRIMARY_PROVIDER}"
        + (f", nivel {level}" if level else "")
        + f"); fallback {FALLBACK_MODEL}. Origen: {origin}."
    )
    log_event(ANALYSIS_ID, "info", msg, EVENT_SOURCE)


def validate_env():
    """Ensure all required environment variables are set."""
    missing = [
        var for var, val in [
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROCESSED_FILES_PATH", API_PROCESSED_FILES_PATH),
            ("API_ORIGINAL_FILES_PATH", API_ORIGINAL_FILES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_TENDERS_PATH", API_TENDERS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(
            f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# LLM prompts and helpers
# ---------------------------------------------------------------------------
GROUPING_PROMPT = (Path(__file__).parent / "prompt_proposal_grouping.md").read_text(encoding="utf-8")


NAMING_PROMPT = (Path(__file__).parent / "prompt_tender_naming.md").read_text(encoding="utf-8")


def _openai_json(openai_client: OpenAI, prompt: str, model: str) -> dict:
    response = openai_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    in_u, out_u, cached = openai_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "openai", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached, pricing=PRICING)
    return json.loads(response.choices[0].message.content)


def _gemini_json(gemini_client: genai.Client, prompt: str, model: str) -> dict:
    response = gemini_client.models.generate_content(
        model=model,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    in_u, out_u, cached = gemini_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "gemini", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached, pricing=PRICING)
    return json.loads(response.text)


def call_llm_json(gemini_client: genai.Client, openai_client: OpenAI, prompt: str) -> dict:
    """Call the user-selected primary model for JSON generation; fall back to the other provider."""
    last_error = None
    for provider, model in [(PRIMARY_PROVIDER, PRIMARY_MODEL), (FALLBACK_PROVIDER, FALLBACK_MODEL)]:
        if not model:
            continue
        try:
            if provider == "gemini":
                return _gemini_json(gemini_client, prompt, model)
            return _openai_json(openai_client, prompt, model)
        except Exception as e:
            last_error = e
            logger.warning(f"{provider}/{model} failed ({e}), trying next...")
    raise last_error


# ---------------------------------------------------------------------------
# Grouping and creation logic
# ---------------------------------------------------------------------------
def group_proposal_files(gemini_client: genai.Client, openai_client: OpenAI, proposal_files: list[dict]) -> list[dict]:
    """Send only metadata of proposal files to LLM to group them by company/domain."""
    files_for_prompt = []
    for f in proposal_files:
        metadata = f.get("metadata") or {}
        ds = f.get("digital_signatures") or {}
        files_for_prompt.append({
            "id": f["id"],
            "file_name": f.get("file_name", "unknown"),
            "company_name": metadata.get("company_name"),
            "company_role": metadata.get("company_role"),
            "document_purpose": metadata.get("document_purpose"),
            "key_identifiers": metadata.get("key_identifiers"),
            "summary": metadata.get("summary"),
            "digital_signatures": {
                "has_signatures": ds.get("has_signatures", False),
                "extraction_status": ds.get("extraction_status"),
                "signers": [
                    {
                        "signer_name": s.get("signer_name"),
                        "organization": s.get("organization"),
                        "tax_id": s.get("tax_id"),
                    }
                    for s in (ds.get("signatures") or [])
                ],
            },
        })

    prompt = GROUPING_PROMPT.format(files_json=json.dumps(
        files_for_prompt, ensure_ascii=False, indent=2))

    result = call_llm_json(gemini_client, openai_client, prompt)

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


def create_proposals_and_update_files(gemini_client: genai.Client, openai_client: OpenAI, files: list[dict]):
    """Group proposal files, create proposal records, and update file proposal_id."""
    proposal_files = [f for f in files if f.get(
        "category") == "proposal" and f.get("metadata")]

    if not proposal_files:
        logger.info("No proposal files to group.")
        return

    logger.info(f"Grouping {len(proposal_files)} proposal files...")
    log_event(ANALYSIS_ID, "info",
              f"Agrupando {len(proposal_files)} archivos de propuesta.", EVENT_SOURCE)

    groups = group_proposal_files(gemini_client, openai_client, proposal_files)
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
        logger.info(
            f"Created proposal '{label}' (id={proposal_id}) with {len(file_ids)} files.")

        # Update each file with proposal_id
        for file_id in file_ids:
            api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{file_id}", {
                        "proposal_id": proposal_id})

            # Propagate to linked source file
            file_record = file_lookup.get(file_id)
            link_id = file_record.get(
                "original_file_id") if file_record else None
            if link_id:
                api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {
                            "proposal_id": proposal_id})
                logger.info(f"Propagated proposal_id to linked file {link_id}")

        log_event(ANALYSIS_ID, "info",
                  f"Propuesta '{label}' creada con {len(file_ids)} archivos.", EVENT_SOURCE)
        proposals_created += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Se crearon {proposals_created} propuestas a partir de {len(proposal_files)} archivos de propuesta.",
        EVENT_SOURCE,
    )
    logger.info(
        f"Proposal grouping complete — {proposals_created} proposals created.")


def generate_tender_info(gemini_client: genai.Client, openai_client: OpenAI, files: list[dict]) -> tuple[str | None, str | None]:
    """Generate analysis name and contracting entity from tender file metadata.
    Returns (generated_name, contracting_entity). Also PATCHes the analysis with generated_name."""
    tender_files = [
        f for f in files
        if f.get("category") == "tender" and f.get("metadata")
    ]

    if not tender_files:
        logger.info(
            "No processed tender files available — skipping tender info generation.")
        return None, None

    logger.info(
        f"Generating tender info from {len(tender_files)} tender files...")

    files_for_prompt = []
    for f in tender_files:
        metadata = f.get("metadata") or {}
        ds = f.get("digital_signatures") or {}
        files_for_prompt.append({
            "file_name": f.get("file_name", "unknown"),
            "document_type": metadata.get("document_type"),
            "company_name": metadata.get("company_name"),
            "company_role": metadata.get("company_role"),
            "document_purpose": metadata.get("document_purpose"),
            "key_identifiers": metadata.get("key_identifiers"),
            "summary": metadata.get("summary"),
            "digital_signatures": {
                "has_signatures": ds.get("has_signatures", False),
                "extraction_status": ds.get("extraction_status"),
                "signers": [
                    {
                        "signer_name": s.get("signer_name"),
                        "organization": s.get("organization"),
                        "tax_id": s.get("tax_id"),
                    }
                    for s in (ds.get("signatures") or [])
                ],
            },
        })

    prompt = NAMING_PROMPT.format(files_json=json.dumps(
        files_for_prompt, ensure_ascii=False, indent=2))

    result = call_llm_json(gemini_client, openai_client, prompt)
    generated_name = (result.get("generated_name") or "").strip() or None
    contracting_entity = (result.get("contracting_entity")
                          or "").strip() or None

    if generated_name:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}", {
                    "generated_name": generated_name})
        logger.info(f"Analysis name set to: '{generated_name}'")
        log_event(ANALYSIS_ID, "info",
                  f"Nombre del análisis generado: '{generated_name}'.", EVENT_SOURCE)
    else:
        logger.warning("Gemini returned empty generated_name.")

    return generated_name, contracting_entity


def create_tender_and_update_files(files: list[dict], generated_name: str | None, contracting_entity: str | None):
    """Create one tender record for the analysis and link tender/normative files to it."""
    tender_normative_files = [f for f in files if f.get(
        "category") in ("tender", "normative")]

    if not tender_normative_files:
        logger.info(
            "No tender/normative files to link — skipping tender creation.")
        return

    logger.info(f"Creating tender for analysis {ANALYSIS_ID}...")
    log_event(ANALYSIS_ID, "info", "Creando registro de tender.", EVENT_SOURCE)

    tender = api_request("POST", API_TENDERS_PATH, {
        "analysis_id": ANALYSIS_ID,
        "label": generated_name,
        "provider_name": contracting_entity,
    })
    tender_id = tender["id"]
    logger.info(
        f"Created tender (id={tender_id}, label='{generated_name}', provider='{contracting_entity}')")

    file_lookup = {f["id"]: f for f in files}
    linked = 0

    for file_record in tender_normative_files:
        file_id = file_record["id"]
        file_name = file_record.get("file_name", "unknown")
        api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{file_id}", {
                    "tender_id": tender_id})

        link_id = file_record.get("original_file_id")
        if link_id:
            api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {
                        "tender_id": tender_id})
            logger.info(f"Propagated tender_id to linked file {link_id}")

        logger.info(
            f"Linked '{file_name}' (category={file_record.get('category')}) to tender {tender_id}")
        linked += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Tender creado con {linked} archivos (tender/normative) vinculados.",
        EVENT_SOURCE,
    )
    logger.info(f"Tender creation complete — {linked} files linked.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status",
                    {"status": "ready", "is_success": False})
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


def cleanup_previous_run():
    """Remove proposals and tenders created by prior runs for this analysis.

    The file-side FK references (proposal_id, tender_id on processed_files /
    original_files) are expected to be nulled or cascaded by the backend when
    the parent row is deleted.
    """
    logger.info("Cleanup: removing proposals and tenders from previous runs...")

    for label, path in [
        ("proposals", f"{API_PROPOSALS_PATH}by-analysis/{ANALYSIS_ID}"),
        ("tenders", f"{API_TENDERS_PATH}by-analysis/{ANALYSIS_ID}"),
    ]:
        try:
            api_request("DELETE", path)
            logger.info(f"Cleanup: {label} deleted via API.")
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.warning(
                    f"Cleanup: DELETE {path} not implemented (see todo-api.md)."
                )
            else:
                raise


def process_documents_grouping():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}")

    # 0. Cleanup proposals / tenders from previous runs
    cleanup_previous_run()

    # 1. Fetch all files for this analysis
    files = api_request("POST", f"{API_PROCESSED_FILES_PATH}search", {
                        "analysis_id": ANALYSIS_ID})

    if not files:
        logger.warning("No files found for this analysis.")
        log_event(ANALYSIS_ID, "warning",
                  "No se encontraron archivos para agrupar.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    logger.info(f"Found {len(files)} files for analysis.")
    log_event(ANALYSIS_ID, "info",
              f"Agrupando archivos de {len(files)} archivos clasificados.", EVENT_SOURCE)

    # 2. Initialize LLM clients
    gemini = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    # 3. Group proposal files and create proposal records
    create_proposals_and_update_files(gemini, openai_client, files)

    # 4. Generate analysis name + contracting entity from tender metadata
    generated_name, contracting_entity = generate_tender_info(
        gemini, openai_client, files)

    # 5. Create tender record and link tender/normative files
    create_tender_and_update_files(files, generated_name, contracting_entity)

    logger.info(f"{SERVICE_NAME} complete ✓")

    # 6. Notify success callback
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "status": "success",
    })


def main():
    global PRICING
    validate_env()
    resolve_model_config()
    PRICING = load_pricing()
    try:
        process_documents_grouping()
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
