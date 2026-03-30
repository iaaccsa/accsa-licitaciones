"""
File Metadata Extractor Service
================================
Reads all chunks from a per-file Qdrant collection (created by service-qdrant-by-file),
sends the concatenated text to Gemini to extract identifying metadata (document type,
company name, purpose, key identifiers, etc.), and persists the result via the
backend API (PATCH /api/v1/files/{file_id}).

Required environment variables:
  - QDRANT_URL             : Qdrant instance URL
  - QDRANT_API_KEY         : Qdrant API key
  - GOOGLE_API_KEY         : Google Gemini API key
  - API_BASE_URL           : Backend API base URL
  - API_KEY                : API key for backend authentication
  - API_EVENTS_PATH        : Path for events endpoint
  - API_ANALYSES_PATH      : Path for analyses endpoint
  - API_FILES_PATH         : Path for files endpoint
  - API_JOBS_CALLBACK      : Path for job status callback
  - ANALYSIS_ID            : UUID of the analysis to process (runtime)
  - FILE_ID                : UUID of the file to process (runtime)
"""

import json
import os
import sys
import time
from typing import List

from google import genai
from google.genai import types as genai_types
import requests
from qdrant_client import QdrantClient
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
FILE_ID = os.environ.get("FILE_ID")

SERVICE_NAME = "service-file-metadata-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
MAX_CHARS = 10000

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
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_FILES_PATH", API_FILES_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
            ("FILE_ID", FILE_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def fetch_all_chunks(qdrant: QdrantClient, collection_name: str) -> List[str]:
    """Scroll all chunks from a per-file Qdrant collection. Returns texts in order."""
    logger.info(f"Scrolling Qdrant collection '{collection_name}' for all chunks...")
    texts: List[str] = []
    offset = None

    while True:
        points, next_offset = qdrant.scroll(
            collection_name=collection_name,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            if point.payload:
                text = point.payload.get("text")
                if text:
                    texts.append(text)

        offset = next_offset
        if offset is None:
            break

    logger.info(f"Found {len(texts)} chunks in collection '{collection_name}'.")
    return texts


# ---------------------------------------------------------------------------
# Gemini extraction
# ---------------------------------------------------------------------------
EXTRACTION_PROMPT = """You are a data extractor specialized in public procurement documents.
Extract metadata from this document. Return a JSON object with these fields (null if not found):

- document_type: classify as one of:
  - "pliego": tender terms, specifications, or conditions issued by the contracting entity
  - "propuesta": bid or proposal submitted by a vendor/bidder
  - "normativa": laws, regulations, or legal standards referenced in the process
  - "otro": documents that don't fit the above categories
- company_name: name of the company or entity that authored or is primarily associated with this document
- company_role: classify as one of:
  - "licitante": the contracting entity calling for bids
  - "oferente": a bidder or vendor submitting a proposal
  - "regulador": a regulatory or oversight body
  - "otro": if the role doesn't fit the above
- document_purpose: 1-2 sentence description of the document's objective
- key_identifiers:
  - tax_id: fiscal/tax identifier (RUT, CUIT, NIT, RFC, or equivalent), null if not found
  - contract_number: tender, contract, or procurement reference number, null if not found
  - representative_name: legal representative or signatory name, null if not found
- summary: 2-3 sentence summary of the document content

Preserve all values in their original language as they appear in the document.

DOCUMENT TEXT:
{text}"""


def extract_metadata_with_gemini(client: genai.Client, text: str, max_retries: int = 3) -> dict:
    """Call Gemini to extract structured metadata from document text."""
    prompt = EXTRACTION_PROMPT.format(text=text)

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            result = json.loads(response.text)
            if isinstance(result, list):
                result = result[0]
            return result
        except Exception as e:
            error_str = str(e)
            is_transient = any(code in error_str for code in ["503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"])
            if is_transient and attempt < max_retries - 1:
                wait = 2 ** attempt * 5  # 5s, 10s, 20s
                logger.warning(f"Gemini transient error (attempt {attempt + 1}/{max_retries}), retrying in {wait}s: {error_str}")
                time.sleep(wait)
            else:
                raise


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


def process_file_metadata_extraction():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID} FILE_ID={FILE_ID}")

    # 1. Fetch analysis to get slug for collection name
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    analysis_slug = analysis["slug"]
    collection_name = f"FILE_{analysis_slug}_{FILE_ID}"
    logger.info(f"Target Qdrant collection: {collection_name}")

    # 2. Fetch file record
    file_record = api_request("GET", f"{API_FILES_PATH}{FILE_ID}")
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

    file_name = file_record["file_name"]
    log_event(ANALYSIS_ID, "info", f"Iniciando extraccion de metadata para: {file_name}", EVENT_SOURCE)

    # 3. Scroll all chunks from the per-file Qdrant collection
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    if not qdrant.collection_exists(collection_name):
        error_msg = f"Qdrant collection '{collection_name}' does not exist."
        logger.error(error_msg)
        log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "file_id": FILE_ID,
            "status": "success",
        })
        return

    texts = fetch_all_chunks(qdrant, collection_name)

    if not texts:
        logger.warning(f"No chunks found in collection '{collection_name}'. Nothing to process.")
        log_event(ANALYSIS_ID, "warning", f"No se encontraron chunks para {file_name}.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "file_id": FILE_ID,
            "status": "success",
        })
        return

    # 4. Concatenate chunks up to MAX_CHARS
    combined = ""
    for t in texts:
        if len(combined) + len(t) > MAX_CHARS:
            break
        combined += t + "\n\n"

    logger.info(f"Extracting metadata for '{file_name}' ({len(texts)} chunks, {len(combined)} chars)")

    # 5. Extract metadata with Gemini
    gemini = genai.Client(api_key=GOOGLE_API_KEY)
    metadata = extract_metadata_with_gemini(gemini, combined)
    logger.info(f"Metadata extracted: document_type={metadata.get('document_type')}, "
                f"company={metadata.get('company_name')}")

    # 6. Persist metadata via API
    api_request("PATCH", f"{API_FILES_PATH}{FILE_ID}", {"metadata": metadata})

    log_event(
        ANALYSIS_ID, "info",
        f"Metadata extraida para '{file_name}': tipo={metadata.get('document_type')}, "
        f"empresa={metadata.get('company_name')}",
        EVENT_SOURCE,
    )

    logger.info(f"{SERVICE_NAME} complete ✓")

    # 7. Notify success callback
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "file_id": FILE_ID,
        "status": "success",
    })


def main():
    validate_env()
    try:
        process_file_metadata_extraction()
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
