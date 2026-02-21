"""
Chunk and Index Service
=======================
Fetches the list of RAG-ready files for an analysis via API,
downloads each Markdown file from Supabase Storage,
splits it into semantic chunks, generates OpenAI embeddings,
and indexes the chunks into the Qdrant collection for the analysis.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - ANALYSIS_ID
  - API_URL_GET_FILES_FOR_RAG
"""

import os
import sys
import uuid
import time
from datetime import datetime, timezone
import requests
from typing import List, Dict, Any
from supabase import create_client, Client
from qdrant_client import QdrantClient
from qdrant_client.http import models
from openai import OpenAI
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

# Try to import shared logger
try:
    from supabase_logger import setup_logger, log_event, mark_failed
except ImportError:
    # Fallback for local testing
    import logging
    def setup_logger(name):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(handler)
        return logger
    def log_event(supabase, analysis_id, level, message, source):
        print(f"[{level.upper()}] {source}: {message}")
    def mark_failed(supabase, analysis_id, message, source):
        print(f"[FAILED] {source}: {message}")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EVENT_SOURCE = "ACA: service-chunk-and-index"
EMBEDDING_MODEL = "text-embedding-3-small"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
API_URL_GET_FILES_FOR_RAG = os.environ.get("API_URL_GET_FILES_FOR_RAG")

logger = setup_logger("chunk-and-index")



# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not OPENAI_API_KEY: missing.append("OPENAI_API_KEY")
    if not QDRANT_URL: missing.append("QDRANT_URL")
    if not QDRANT_API_KEY: missing.append("QDRANT_API_KEY")
    if not ANALYSIS_ID: missing.append("ANALYSIS_ID")
    if not API_URL_GET_FILES_FOR_RAG: missing.append("API_URL_GET_FILES_FOR_RAG")

    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def get_openai_client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY)

# ---------------------------------------------------------------------------
# File fetching
# ---------------------------------------------------------------------------
def fetch_files_for_rag(analysis_id: str) -> List[Dict[str, Any]]:
    """Fetches the list of files to process via POST to the RAG API."""
    logger.info(f"Fetching files for analysis_id={analysis_id} from API...")
    try:
        response = requests.post(
            API_URL_GET_FILES_FOR_RAG,
            json={"uuid": analysis_id},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        files = response.json()
        logger.info(f"API returned {len(files)} files.")
        return files
    except Exception as e:
        logger.error(f"Error fetching files from API: {e}")
        raise

def fetch_analysis_slug(supabase: Client, analysis_id: str) -> str:
    """Fetches the analysis slug from Supabase."""
    try:
        response = supabase.table("analyses").select("slug").eq("id", analysis_id).single().execute()
        return response.data["slug"]
    except Exception as e:
        logger.error(f"Error fetching analysis slug for {analysis_id}: {e}")
        raise

def download_file_content(supabase: Client, storage_path: str) -> str:
    """Downloads a file from Supabase Storage and returns its text content."""
    try:
        response = supabase.storage.from_("files").download(storage_path)
        return response.decode("utf-8")
    except Exception as e:
        logger.error(f"Error downloading file from {storage_path}: {e}")
        raise

# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def split_text_semantically(text: str) -> List[Dict[str, Any]]:
    """
    Splits markdown text by headers to preserve semantic context,
    then recursively splits large chunks if they exceed size limits.
    """
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

    structured_chunks = []
    for doc in final_chunks:
        structured_chunks.append({
            "text": doc.page_content,
            "metadata": doc.metadata
        })

    return structured_chunks

# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
def get_embeddings(client: OpenAI, texts: List[str], model: str = EMBEDDING_MODEL) -> List[List[float]]:
    """Generates embeddings using OpenAI API in batches."""
    embeddings = []
    batch_size = 100

    logger.info(f"Generating embeddings for {len(texts)} chunks...")

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        batch = [t.replace("\n", " ") for t in batch]

        try:
            response = client.embeddings.create(input=batch, model=model)
            batch_embeddings = [data.embedding for data in response.data]
            embeddings.extend(batch_embeddings)
            logger.info(f"  Batch {i//batch_size + 1}: {len(batch)} embeddings generated")
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Error generating embeddings for batch at index {i}: {e}")
            raise

    return embeddings

# ---------------------------------------------------------------------------
# Qdrant upload
# ---------------------------------------------------------------------------
def upload_to_qdrant(
    client: QdrantClient,
    collection_name: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    file_record: Dict[str, Any]
):
    """Upserts vectors and metadata to Qdrant."""
    points = []
    for i, (chunk, vector) in enumerate(zip(chunks, embeddings)):
        # Build label: use proposal_label for proposals, "tender" for tender files
        label = file_record.get("proposal_label") or file_record.get("category", "")

        payload = {
            "text": chunk["text"],
            "file_id": file_record["id"],
            "analysis_id": file_record["analysis_id"],
            "category": file_record["category"],
            "label": label,
            "proposal_id": file_record.get("proposal_id"),
            "proposal_provider_name": file_record.get("proposal_provider_name"),
            "filename": file_record["file_name"],
            **chunk["metadata"]
        }

        points.append(models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload=payload
        ))

    batch_size = 100
    logger.info(f"Uploading {len(points)} points to Qdrant collection '{collection_name}'...")

    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(
            collection_name=collection_name,
            points=batch
        )
        logger.info(f"Uploaded batch {i//batch_size + 1}: {len(batch)} points")

    logger.info(f"Upload complete for file '{file_record['file_name']}'.")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    validate_env()
    logger.info(f"Starting Chunk and Index Service for ANALYSIS_ID={ANALYSIS_ID}")

    supabase = get_supabase_client()
    openai_client = get_openai_client()
    qdrant_client = get_qdrant_client()

    try:
        # 1. Fetch analysis slug (= Qdrant collection name)
        logger.info("Fetching analysis slug...")
        slug = fetch_analysis_slug(supabase, ANALYSIS_ID)
        collection_name = slug
        logger.info(f"Target Qdrant collection: {collection_name}")

        log_event(supabase, ANALYSIS_ID, "info", f"Iniciando indexación para análisis: {ANALYSIS_ID}", EVENT_SOURCE)

        # 2. Fetch file list from API
        all_files = fetch_files_for_rag(ANALYSIS_ID)

        if not all_files:
            logger.warning("No files returned from API. Nothing to index.")
            log_event(supabase, ANALYSIS_ID, "warning", "No se encontraron archivos para indexar.", EVENT_SOURCE)
            return

        total_chunks_indexed = 0
        files_processed = 0
        files_skipped = 0

        # 3. Process each file
        for file_record in all_files:
            file_name = file_record["file_name"]
            storage_path = file_record["storage_path"]
            file_id = file_record["id"]

            logger.info(f"--- Processing file: {file_name} (id={file_id}) ---")

            try:
                # 3a. Download file content
                logger.info(f"Downloading from {storage_path}...")
                content = download_file_content(supabase, storage_path)
                logger.info(f"Downloaded. Size: {len(content)} chars.")

                # 3b. Chunk content
                logger.info("Chunking content...")
                chunks = split_text_semantically(content)
                logger.info(f"Generated {len(chunks)} chunks.")

                if not chunks:
                    logger.warning(f"No chunks generated for {file_name}. Skipping.")
                    files_skipped += 1
                    continue

                # 3c. Generate embeddings
                texts = [c["text"] for c in chunks]
                embeddings = get_embeddings(openai_client, texts)

                # 3d. Upload to Qdrant
                upload_to_qdrant(qdrant_client, collection_name, chunks, embeddings, file_record)

                # 3e. Update total_chunks in Supabase
                logger.info(f"Updating files table with total_chunks={len(chunks)}...")
                try:
                    supabase.table("files").update({"total_chunks": len(chunks)}).eq("id", file_id).execute()
                except Exception as e:
                    logger.error(f"Error updating total_chunks for file {file_id}: {e}")
                    # Don't fail the whole process for this, just log it

                total_chunks_indexed += len(chunks)
                files_processed += 1

                log_event(
                    supabase, ANALYSIS_ID, "info",
                    f"Archivo indexado: {file_name} ({len(chunks)} chunks)",
                    EVENT_SOURCE
                )

            except Exception as e:
                logger.error(f"Error processing file {file_name}: {e}")
                log_event(
                    supabase, ANALYSIS_ID, "error",
                    f"Error indexando archivo {file_name}: {str(e)}",
                    EVENT_SOURCE
                )
                # Continue with next file
                continue

        # 4. Final summary
        summary = f"Indexación completada: {files_processed} archivos, {total_chunks_indexed} chunks totales."
        if files_skipped:
            summary += f" {files_skipped} archivos omitidos (sin chunks)."

        logger.info(summary)
        log_event(supabase, ANALYSIS_ID, "info", summary, EVENT_SOURCE)
        logger.info("Chunk and Index Service complete ✓")

    except Exception as e:
        error_msg = f"Error fatal en Chunk and Index Service: {str(e)}"
        logger.error(error_msg)
        try:
            log_event(supabase, ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
            mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        except Exception as log_error:
            logger.error(f"Failed to log error to Supabase: {log_error}")
        sys.exit(1)

if __name__ == "__main__":
    main()
