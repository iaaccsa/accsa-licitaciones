"""
Chunk and Index Service
=======================
Fetches a single file record for an analysis via API,
downloads the Markdown file from Supabase Storage,
splits it into semantic chunks, generates OpenAI embeddings,
and indexes the chunks into the Qdrant collection for the analysis.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_KEY
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_FILES_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
  - FILE_ID
"""

import os
import sys
import uuid
import time
from typing import List, Dict, Any

import requests
from supabase import create_client
from qdrant_client import QdrantClient
from qdrant_client.http import models
from openai import OpenAI
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_FILES_PATH = os.environ.get("API_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
FILE_ID = os.environ.get("FILE_ID")

SERVICE_NAME = "service-chunk-and-index"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"

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
    missing = [
        var for var, val in [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
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


def download_file_content(supabase, storage_path: str) -> str:
    """Downloads a file from Supabase Storage and returns its text content."""
    response = supabase.storage.from_("files").download(storage_path)
    return response.decode("utf-8")


def split_text_semantically(text: str) -> List[Dict[str, Any]]:
    """Splits markdown text by headers then recursively splits large chunks."""
    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
    md_header_splits = markdown_splitter.split_text(text)
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " ", ""]
    )
    final_chunks = text_splitter.split_documents(md_header_splits)
    return [{"text": doc.page_content, "metadata": doc.metadata} for doc in final_chunks]


def get_embeddings(client: OpenAI, texts: List[str]) -> List[List[float]]:
    """Generates embeddings using OpenAI API in batches."""
    embeddings = []
    batch_size = 100
    logger.info(f"Generating embeddings for {len(texts)} chunks...")
    for i in range(0, len(texts), batch_size):
        batch = [t.replace("\n", " ") for t in texts[i:i + batch_size]]
        response = client.embeddings.create(input=batch, model=EMBEDDING_MODEL)
        embeddings.extend([data.embedding for data in response.data])
        logger.info(f"  Batch {i // batch_size + 1}: {len(batch)} embeddings generated")
        time.sleep(0.1)
    return embeddings


def upload_to_qdrant(
    client: QdrantClient,
    collection_name: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    file_record: Dict[str, Any]
):
    """Upserts vectors and metadata to Qdrant."""
    label = file_record.get("proposal_label") or file_record.get("category", "")
    points = [
        models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "text": chunk["text"],
                "chunk_index": i,
                "file_id": file_record["id"],
                "analysis_id": file_record["analysis_id"],
                "category": file_record["category"],
                "label": label,
                "proposal_id": file_record.get("proposal_id"),
                "proposal_provider_name": file_record.get("proposal_provider_name"),
                "filename": file_record["file_name"],
                **chunk["metadata"]
            }
        )
        for i, (chunk, vector) in enumerate(zip(chunks, embeddings))
    ]
    batch_size = 100
    logger.info(f"Uploading {len(points)} points to Qdrant collection '{collection_name}'...")
    for i in range(0, len(points), batch_size):
        client.upsert(collection_name=collection_name, points=points[i:i + batch_size])
        logger.info(f"Uploaded batch {i // batch_size + 1}: {len(points[i:i + batch_size])} points")
    logger.info(f"Upload complete for file '{file_record['file_name']}'.")


def process_indexing():
    logger.info(f"Starting Chunk and Index Service for ANALYSIS_ID={ANALYSIS_ID}, FILE_ID={FILE_ID}")

    # Clients (Supabase only for storage.download)
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    # 1. Fetch analysis slug (= Qdrant collection name)
    logger.info("Fetching analysis slug...")
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    collection_name = analysis["slug"]
    logger.info(f"Target Qdrant collection: {collection_name}")

    log_event(ANALYSIS_ID, "info", f"Iniciando indexación de archivo {FILE_ID}", EVENT_SOURCE)

    # 2. Fetch file record via merged endpoint and filter by FILE_ID
    all_files = api_request("POST", f"{API_FILES_PATH}merged", {"analysis_id": ANALYSIS_ID})
    file_record = next((f for f in (all_files or []) if f["id"] == FILE_ID), None)
    if not file_record:
        raise ValueError(f"File {FILE_ID} not found in merged files for analysis {ANALYSIS_ID}")

    file_name = file_record["file_name"]
    storage_path = file_record["storage_path"]

    logger.info(f"Processing file: {file_name} (id={FILE_ID})")

    # 3a. Download file content from Supabase Storage
    logger.info(f"Downloading from {storage_path}...")
    content = download_file_content(supabase, storage_path)
    logger.info(f"Downloaded. Size: {len(content)} chars.")

    # 3b. Chunk content
    logger.info("Chunking content...")
    chunks = split_text_semantically(content)
    logger.info(f"Generated {len(chunks)} chunks.")

    if not chunks:
        logger.warning(f"No chunks generated for {file_name}.")
        log_event(ANALYSIS_ID, "warning", f"Archivo {file_name} no generó chunks.", EVENT_SOURCE)
        return

    # 3c. Generate embeddings
    texts = [c["text"] for c in chunks]
    embeddings = get_embeddings(openai_client, texts)

    # 3d. Upload to Qdrant
    upload_to_qdrant(qdrant_client, collection_name, chunks, embeddings, file_record)

    # 3e. Update total_chunks via API
    logger.info(f"Updating file record with total_chunks={len(chunks)}...")
    try:
        api_request("PATCH", f"{API_FILES_PATH}{FILE_ID}", {"total_chunks": len(chunks)})
    except Exception as e:
        logger.error(f"Error updating total_chunks for file {FILE_ID}: {e}")

    summary = f"Archivo indexado: {file_name} ({len(chunks)} chunks)"
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE)
    logger.info("Chunk and Index Service complete ✓")

    # 4. Notify success callback
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
        process_indexing()
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
