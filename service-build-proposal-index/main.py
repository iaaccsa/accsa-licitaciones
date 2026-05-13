"""
Build Proposal Index Service
============================
For a given PROPOSAL_ID, copies all points from the proposal's per-file
collections `FILE_{analysis_slug}_{file_id}` into a single dedicated
collection `PROPOSAL_{analysis_slug}_{proposal_id}`. Compliance-matcher
then issues a single ANN query per requirement against this collection.

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
  - PROPOSAL_ID
"""

import os
import sys
from typing import List

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
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")

SERVICE_NAME = "service-build-proposal-index"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
VECTOR_SIZE = 1536  # text-embedding-3-small
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
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
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
            ("PROPOSAL_ID", PROPOSAL_ID),
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
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "proposal_id": PROPOSAL_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def copy_file_collection(qdrant: QdrantClient, source: str, target: str) -> int:
    """Scroll all points from source and upsert into target. Returns total points copied."""
    total = 0
    offset = None
    while True:
        points, next_offset = qdrant.scroll(
            collection_name=source,
            limit=SCROLL_BATCH_SIZE,
            offset=offset,
            with_payload=True,
            with_vectors=True,
        )
        if points:
            structs = [
                models.PointStruct(id=str(p.id), vector=p.vector, payload=p.payload)
                for p in points
            ]
            for i in range(0, len(structs), UPSERT_BATCH_SIZE):
                qdrant.upsert(collection_name=target, points=structs[i:i + UPSERT_BATCH_SIZE])
            total += len(structs)
        offset = next_offset
        if offset is None:
            break
    return total


def process_build_proposal_index():
    logger.info(f"Starting {SERVICE_NAME} for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    # 1. Resolve analysis slug
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]

    target = f"PROPOSAL_{slug}_{PROPOSAL_ID}"
    log_event(ANALYSIS_ID, "info", f"Construyendo colección {target}", EVENT_SOURCE)

    # 2. List proposal files
    proposal_files = api_request(
        "POST",
        f"{API_PROCESSED_FILES_PATH}search",
        {"analysis_id": ANALYSIS_ID, "category": "proposal", "proposal_id": PROPOSAL_ID},
    )
    if not isinstance(proposal_files, list):
        raise RuntimeError(f"Unexpected response from processed-files search: {type(proposal_files)}")

    logger.info(f"Proposal has {len(proposal_files)} files.")
    if not proposal_files:
        msg = f"No proposal files found for proposal {PROPOSAL_ID}; skipping."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)

    # 3. Idempotent target collection (drop + create)
    if qdrant.collection_exists(target):
        logger.info(f"Dropping existing collection '{target}'.")
        qdrant.delete_collection(target)

    logger.info(f"Creating collection '{target}' (size={VECTOR_SIZE}, distance=Cosine).")
    qdrant.create_collection(
        collection_name=target,
        vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
    )

    # 4. Copy each file's collection into target
    total_points = 0
    skipped_files: List[str] = []
    for f in proposal_files:
        file_id = f["id"]
        file_name = f.get("file_name") or ""
        source = f"FILE_{slug}_{file_id}"
        if not qdrant.collection_exists(source):
            logger.warning(f"Source collection '{source}' missing; skipping file '{file_name}'.")
            skipped_files.append(file_name)
            continue
        copied = copy_file_collection(qdrant, source, target)
        total_points += copied
        logger.info(f"  '{file_name}': copied {copied} points from '{source}'.")

    summary = (
        f"Colección {target} construida con {total_points} puntos "
        f"({len(proposal_files) - len(skipped_files)}/{len(proposal_files)} archivos)."
    )
    if skipped_files:
        summary += f" Archivos omitidos: {', '.join(skipped_files)}."
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE)

    # 5. Success callback
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "proposal_id": PROPOSAL_ID,
            "status": "success",
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def main():
    validate_env()
    try:
        process_build_proposal_index()
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
