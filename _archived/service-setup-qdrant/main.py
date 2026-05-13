"""
Qdrant Setup Service
====================
Queries the backend API for a specific analysis by ID, then creates or
recreates a Qdrant collection (named by the analysis slug) with the
required payload indexes.

Required environment variables:
  - SUPABASE_URL               : Supabase project URL
  - SUPABASE_SERVICE_KEY       : Service role key for authenticated access
  - API_BASE_URL               : Backend API base URL
  - API_KEY                    : API key for backend authentication
  - API_EVENTS_PATH            : Path for events endpoint
  - API_ANALYSES_PATH          : Path for analyses endpoint
  - API_JOBS_CALLBACK          : Path for job callback endpoint
  - ANALYSIS_ID                : UUID of the analysis to process
  - QDRANT_URL                 : Qdrant instance URL
  - QDRANT_API_KEY             : Qdrant API key
"""

import os
import sys

import requests
from qdrant_client import QdrantClient
from qdrant_client.http import models

from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")

SERVICE_NAME = "service-setup-qdrant"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
VECTOR_SIZE = 1536  # text-embedding-3-small

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


def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not API_BASE_URL:
        missing.append("API_BASE_URL")
    if not API_KEY:
        missing.append("API_KEY")
    if not API_EVENTS_PATH:
        missing.append("API_EVENTS_PATH")
    if not API_ANALYSES_PATH:
        missing.append("API_ANALYSES_PATH")
    if not API_JOBS_CALLBACK:
        missing.append("API_JOBS_CALLBACK")
    if not ANALYSIS_ID:
        missing.append("ANALYSIS_ID")
    if not QDRANT_URL:
        missing.append("QDRANT_URL")
    if not QDRANT_API_KEY:
        missing.append("QDRANT_API_KEY")
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

    # 3. Notify API callback
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def process_setup():
    logger.info(f"Starting Qdrant setup for analysis_id={ANALYSIS_ID}")

    # 1. Fetch the analysis to get the slug
    logger.info("Fetching analysis via API ...")
    log_event(ANALYSIS_ID, "info", "Iniciando configuración de Qdrant", EVENT_SOURCE)
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")

    slug = analysis["slug"].strip()
    logger.info(f"Found analysis slug: {slug}")

    # 2. Connect to Qdrant
    qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    logger.info("Connected to Qdrant")

    # 3. Recreate collection
    collection_name = slug

    if qdrant_client.collection_exists(collection_name):
        logger.info(f"Collection '{collection_name}' exists. Deleting...")
        qdrant_client.delete_collection(collection_name)
        logger.info(f"Collection '{collection_name}' deleted.")
        log_event(ANALYSIS_ID, "info", f"Colección Qdrant eliminada: {collection_name}", EVENT_SOURCE)

    logger.info(f"Creating collection '{collection_name}' (size={VECTOR_SIZE}, dist=Cosine)...")
    qdrant_client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(
            size=VECTOR_SIZE,
            distance=models.Distance.COSINE
        ),
        optimizers_config=models.OptimizersConfigDiff(
            memmap_threshold=20000
        )
    )
    logger.info(f"Collection '{collection_name}' created.")

    # 4. Create payload indexes
    logger.info("Creating payload indexes...")

    # Index for analysis_id (CRITICAL for filters)
    qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="analysis_id",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

    # Index for file_id
    qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="file_id",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

    # Index for category (tender vs proposal) - CRITICAL for filtering
    qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="category",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

    # Index for proposal_id
    qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="proposal_id",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

    # Index for label (used for refined filtering)
    qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="label",
        field_schema=models.PayloadSchemaType.KEYWORD
    )

    logger.info("Payload indexes created.")
    log_event(ANALYSIS_ID, "info", f"Colección Qdrant configurada: {collection_name}", EVENT_SOURCE)

    logger.info("Qdrant setup service complete ✓")
    log_event(ANALYSIS_ID, "info", "Configuración de Qdrant finalizada exitosamente", EVENT_SOURCE)

    # 5. Notify API callback on success
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
        process_setup()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during processing: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        error_msg = f"Failed during processing: {str(e)}"
        notify_failure(error_msg)
        sys.exit(0)


if __name__ == "__main__":
    main()
