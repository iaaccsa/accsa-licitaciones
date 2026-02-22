"""
Metadata Extractor Service
==========================
Reads all proposal chunks from Qdrant for a given analysis, sends the
concatenated text to Gemini to extract identifying metadata (company name,
email, address, phone, tax_id, representative, etc.), and persists the
result in the `proposals` table via Supabase client.

Required environment variables:
  - QDRANT_URL             : Qdrant instance URL
  - QDRANT_API_KEY         : Qdrant API key
  - SUPABASE_URL           : Supabase project URL
  - SUPABASE_SERVICE_KEY   : Supabase service role key
  - GOOGLE_API_KEY         : Google Gemini API key
  - API_BASE_URL           : Backend API base URL
  - API_KEY                : API key for backend authentication
  - API_EVENTS_PATH        : Path for events endpoint
  - API_ANALYSES_PATH      : Path for analyses endpoint
  - API_JOBS_CALLBACK      : Path for job status callback
  - ANALYSIS_ID            : UUID of the analysis to process (runtime)
"""

import json
import os
import sys
from typing import Dict, List

from google import genai
from google.genai import types as genai_types
import requests
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-metadata-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
MAX_CHARS_PER_PROPOSAL = 8000

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
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def fetch_proposal_chunks(qdrant: QdrantClient, collection: str) -> Dict[str, List[str]]:
    """
    Scroll Qdrant for all chunks with category='proposal' and analysis_id=ANALYSIS_ID.
    Returns a dict mapping proposal_id -> list of text strings.
    """
    logger.info(f"Scrolling Qdrant collection '{collection}' for proposal chunks...")

    proposal_texts: Dict[str, List[str]] = {}
    offset = None
    search_filter = qdrant_models.Filter(
        must=[
            qdrant_models.FieldCondition(
                key="analysis_id", match=qdrant_models.MatchValue(value=ANALYSIS_ID)
            ),
            qdrant_models.FieldCondition(
                key="category", match=qdrant_models.MatchValue(value="proposal")
            ),
        ]
    )

    while True:
        points, next_offset = qdrant.scroll(
            collection_name=collection,
            scroll_filter=search_filter,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            if not point.payload:
                continue
            proposal_id = point.payload.get("proposal_id")
            text = point.payload.get("text")
            if proposal_id and text:
                proposal_texts.setdefault(proposal_id, []).append(text)

        offset = next_offset
        if offset is None:
            break

    logger.info(
        f"Found {len(proposal_texts)} proposal(s) with "
        f"{sum(len(v) for v in proposal_texts.values())} total chunks."
    )
    return proposal_texts


EXTRACTION_PROMPT = """You are a data extractor specialized in public procurement documents.
Analyze the following text from a bid/proposal and extract identifying information about the bidding company.
Return a JSON object with these fields (use null if not found):
- company_name: official company name
- email: contact email address
- address: company address
- phone: phone number
- tax_id: RUT, CUIT, NIT, or any fiscal/tax identifier
- representative_name: name of the legal representative or signatory
- additional: object with any other relevant identifying data found

The values in the JSON should be in the language they appear in the document.

PROPOSAL TEXT:
{text}"""


def extract_metadata_with_gemini(client: genai.Client, text: str) -> dict:
    """Call Gemini to extract structured metadata from proposal text."""
    prompt = EXTRACTION_PROMPT.format(text=text)
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    result = json.loads(response.text)
    return result


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


def process_metadata_extraction():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}")

    # 1. Fetch analysis to get Qdrant collection name (slug)
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    collection = analysis["slug"]
    logger.info(f"Analysis slug (Qdrant collection): {collection}")

    log_event(ANALYSIS_ID, "info", "Iniciando extracción de metadata de proposals...", EVENT_SOURCE)

    # 2. Scroll Qdrant for proposal chunks grouped by proposal_id
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    proposal_chunks = fetch_proposal_chunks(qdrant, collection)

    if not proposal_chunks:
        logger.warning("No proposal chunks found in Qdrant. Nothing to process.")
        log_event(ANALYSIS_ID, "warning", "No se encontraron chunks de proposals en Qdrant.", EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    # 3. Configure Gemini client
    gemini = genai.Client(api_key=GOOGLE_API_KEY)

    # 4. Connect to Supabase for direct table updates
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    processed = 0
    for proposal_id, texts in proposal_chunks.items():
        # Concatenate chunks up to MAX_CHARS_PER_PROPOSAL
        combined = ""
        for t in texts:
            if len(combined) + len(t) > MAX_CHARS_PER_PROPOSAL:
                break
            combined += t + "\n\n"

        logger.info(
            f"Extracting metadata for proposal {proposal_id} "
            f"({len(texts)} chunks, {len(combined)} chars)"
        )

        try:
            metadata = extract_metadata_with_gemini(gemini, combined)
        except Exception as e:
            logger.error(f"Gemini extraction failed for proposal {proposal_id}: {e}")
            log_event(
                ANALYSIS_ID, "warning",
                f"Fallo al extraer metadata para proposal {proposal_id}: {e}",
                EVENT_SOURCE,
            )
            continue

        company_name = metadata.get("company_name")

        supabase.table("proposals").update({
            "provider_name": company_name,
            "provider_metadata": metadata,
        }).eq("id", proposal_id).execute()

        log_event(
            ANALYSIS_ID, "info",
            f"Metadata extraída para proposal {proposal_id}: {company_name}",
            EVENT_SOURCE,
        )
        processed += 1

    log_event(
        ANALYSIS_ID, "info",
        f"Extracción completada. {processed} proposals procesadas.",
        EVENT_SOURCE,
    )
    logger.info(f"{SERVICE_NAME} complete ✓ ({processed} proposals processed)")

    # 5. Notify success callback (no try/except — failures must propagate to main())
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "status": "success",
    })


def main():
    validate_env()
    try:
        process_metadata_extraction()
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
