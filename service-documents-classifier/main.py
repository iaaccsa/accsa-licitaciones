"""
Documents Classifier Service
==============================
Classifies a single file into a category ('tender', 'proposal', 'normative', 'unclassified')
using Google Gemini based on its previously extracted metadata.
Updates the 'category' field via the backend API (PATCH /api/v1/files/{file_id}).

Required environment variables:
  - GOOGLE_API_KEY         : Google Gemini API key (primary model)
  - OPENAI_API_KEY         : OpenAI API key (fallback model)
  - API_BASE_URL           : Backend API base URL
  - API_KEY                : API key for backend authentication
  - API_EVENTS_PATH        : Path for events endpoint
  - API_ANALYSES_PATH      : Path for analyses endpoint
  - API_PROCESSED_FILES_PATH : Path for processed files endpoint
  - API_ORIGINAL_FILES_PATH  : Path for original files endpoint (category propagation)
  - API_JOBS_CALLBACK      : Path for job status callback
  - ANALYSIS_ID            : UUID of the analysis to process (runtime)
  - FILE_ID                : UUID of the file to classify (runtime)
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
from prompt_loader import load_prompt

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
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
FILE_ID = os.environ.get("FILE_ID")

SERVICE_NAME = "service-documents-classifier"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
GEMINI_MODEL = "gemini-2.5-flash"
OPENAI_FALLBACK_MODEL = "gpt-4.1-mini"

# Model selection, resolved at runtime from the analysis (see resolve_model_config).
# Defaults preserve the prior hardcoded behavior if the API is unreachable.
PRIMARY_PROVIDER = "gemini"
PRIMARY_MODEL = GEMINI_MODEL
FALLBACK_PROVIDER = "openai"
FALLBACK_MODEL = OPENAI_FALLBACK_MODEL

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
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
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
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
            ("FILE_ID", FILE_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Gemini classification
# ---------------------------------------------------------------------------
CLASSIFICATION_PROMPT = None  # loaded at runtime in main() via load_prompt


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


def classify_file(gemini_client: genai.Client, openai_client: OpenAI, file_record: dict) -> str:
    """Classify a file based on its metadata. Returns category string."""
    metadata = file_record.get("metadata") or {}

    prompt = CLASSIFICATION_PROMPT.format(
        file_name=file_record.get("file_name", "unknown"),
        document_type=metadata.get("document_type", "unknown"),
        company_name=metadata.get("company_name", "unknown"),
        company_role=metadata.get("company_role", "unknown"),
        document_purpose=metadata.get("document_purpose", "unknown"),
        summary=metadata.get("summary", "unknown"),
    )

    result = call_llm_json(gemini_client, openai_client, prompt)
    return result["category"]


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
            "file_id": FILE_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def process_document_classification():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID} FILE_ID={FILE_ID}")

    # 1. Fetch file record
    file_record = api_request("GET", f"{API_PROCESSED_FILES_PATH}{FILE_ID}")
    if not file_record:
        logger.warning(f"File {FILE_ID} not found.")
        log_event(ANALYSIS_ID, "warning", f"El archivo {FILE_ID} no existe.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "file_id": FILE_ID,
            "status": "success",
        })
        return

    file_name = file_record.get("file_name", "unknown")

    # 2. Check metadata availability
    if not file_record.get("metadata"):
        logger.info(f"Skipping '{file_name}' — no metadata available.")
        log_event(ANALYSIS_ID, "info", f"Archivo '{file_name}' sin metadata, clasificado como 'unclassified'.", EVENT_SOURCE)
        api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{FILE_ID}", {"category": "unclassified"})
        link_id = file_record.get("original_file_id")
        if link_id:
            api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {"category": "unclassified"})
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "file_id": FILE_ID,
            "status": "success",
        })
        return

    log_event(ANALYSIS_ID, "info", f"Clasificando archivo: {file_name}", EVENT_SOURCE)

    # 3. Classify with Gemini (fallback to OpenAI)
    gemini = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    category = classify_file(gemini, openai_client, file_record)
    if category == "unclassified":
        logger.warning(f"Could not classify '{file_name}' — marked as 'unclassified'")
    else:
        logger.info(f"Classified '{file_name}' as '{category}'")

    # 4. Update file category via API
    api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{FILE_ID}", {"category": category})
    log_event(ANALYSIS_ID, "info", f"Archivo '{file_name}' clasificado como '{category}'.", EVENT_SOURCE)

    # 5. Propagate category to the linked source file (if any)
    link_id = file_record.get("original_file_id")
    if link_id:
        api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {"category": category})
        logger.info(f"Propagated '{category}' to linked file {link_id}")

    logger.info(f"{SERVICE_NAME} complete ✓")

    # 6. Notify success callback
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "file_id": FILE_ID,
        "status": "success",
    })


def main():
    global PRICING, CLASSIFICATION_PROMPT
    validate_env()
    CLASSIFICATION_PROMPT = load_prompt("service-documents-classifier/document_category_classifier")
    resolve_model_config()
    PRICING = load_pricing()
    try:
        process_document_classification()
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
