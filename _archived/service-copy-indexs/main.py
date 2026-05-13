"""
Copy Indexs Service
===================
Copies all vectors from a per-file Qdrant collection (FILE_{slug}_{file_id})
into the main analysis collection ({slug}).

No file download, no chunking, no embedding generation — all data
is reused from service-qdrant-by-file.

Required environment variables:
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROCESSED_FILES_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
  - FILE_ID
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
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
FILE_ID = os.environ.get("FILE_ID")

SERVICE_NAME = "service-copy-indexs"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
SCROLL_BATCH_SIZE = 256
UPSERT_BATCH_SIZE = 100

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
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROCESSED_FILES_PATH", API_PROCESSED_FILES_PATH),
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
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def cleanup_previous_run(qdrant: QdrantClient, collection_name: str, file_id: str):
    """Delete any points previously copied for this file from the main collection."""
    try:
        if not qdrant.collection_exists(collection_name):
            logger.info(f"Cleanup: collection '{collection_name}' does not exist yet; nothing to wipe.")
            return
        qdrant.delete(
            collection_name=collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[models.FieldCondition(key="file_id", match=models.MatchValue(value=file_id))]
                )
            ),
        )
        logger.info(f"Cleanup: removed previous points for file_id={file_id} from '{collection_name}'.")
    except Exception as e:
        logger.warning(f"Cleanup: qdrant wipe failed (non-fatal): {e}")


def scroll_source_collection(qdrant: QdrantClient, source_collection: str) -> list:
    """Scroll all points (with vectors) from the per-file collection."""
    all_points = []
    offset = None
    while True:
        points, next_offset = qdrant.scroll(
            collection_name=source_collection,
            limit=SCROLL_BATCH_SIZE,
            offset=offset,
            with_payload=True,
            with_vectors=True,
        )
        all_points.extend(points)
        offset = next_offset
        if offset is None:
            break
    return all_points


def upsert_to_main(qdrant: QdrantClient, target_collection: str, points: list):
    """Upsert points into the main analysis collection in batches."""
    structs = [
        models.PointStruct(
            id=str(p.id),
            vector=p.vector,
            payload=p.payload,
        )
        for p in points
    ]
    logger.info(f"Upserting {len(structs)} points to '{target_collection}'...")
    for i in range(0, len(structs), UPSERT_BATCH_SIZE):
        batch = structs[i:i + UPSERT_BATCH_SIZE]
        qdrant.upsert(collection_name=target_collection, points=batch)
        logger.info(f"  Batch {i // UPSERT_BATCH_SIZE + 1}: {len(batch)} points")
    logger.info("Upsert complete.")


def process_copy():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID}, FILE_ID={FILE_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    # 1. Fetch analysis slug (= main Qdrant collection name)
    logger.info("Fetching analysis slug...")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Main collection: {slug}")

    source_collection = f"FILE_{slug}_{FILE_ID}"
    logger.info(f"Source collection: {source_collection}")

    log_event(ANALYSIS_ID, "info", f"Copiando indices de {source_collection} a {slug}", EVENT_SOURCE)

    # 2. Verify source collection exists
    if not qdrant.collection_exists(source_collection):
        raise RuntimeError(f"Source collection '{source_collection}' does not exist. Run service-qdrant-by-file first.")

    # 3. Cleanup previous points for this file in the main collection
    cleanup_previous_run(qdrant, slug, FILE_ID)

    # 4. Scroll all points from the source collection
    logger.info(f"Scrolling points from '{source_collection}'...")
    points = scroll_source_collection(qdrant, source_collection)
    total_points = len(points)
    logger.info(f"Found {total_points} points in source collection.")

    if not points:
        logger.warning(f"No points in '{source_collection}'. Nothing to copy.")
        log_event(ANALYSIS_ID, "warning", f"Coleccion {source_collection} vacia, nada que copiar.", EVENT_SOURCE)
    else:
        # 5. Upsert into the main collection
        upsert_to_main(qdrant, slug, points)

        # 6. Update total_chunks via API
        logger.info(f"Updating file record with total_chunks={total_points}...")
        try:
            api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{FILE_ID}", {"total_chunks": total_points})
        except Exception as e:
            logger.error(f"Error updating total_chunks for file {FILE_ID}: {e}")

        summary = f"Copiados {total_points} puntos de {source_collection} a {slug}"
        log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE)

    logger.info(f"{SERVICE_NAME} complete ✓")

    # 7. Notify success callback
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
        process_copy()
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
