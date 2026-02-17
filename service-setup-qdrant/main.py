"""
Qdrant Setup Service
====================
Creates or recreates a Qdrant collection for a specific analysis.
The collection name is the analysis 'slug'.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - ANALYSIS_ID
  - QDRANT_URL
  - QDRANT_API_KEY
"""

import os
import sys
from qdrant_client import QdrantClient
from qdrant_client.http import models
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, mark_failed

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")

EVENT_SOURCE = "ACA: service-setup-qdrant"
VECTOR_SIZE = 1536  # text-embedding-3-small

logger = setup_logger("setup-qdrant")

def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not ANALYSIS_ID: missing.append("ANALYSIS_ID")
    if not QDRANT_URL: missing.append("QDRANT_URL")
    if not QDRANT_API_KEY: missing.append("QDRANT_API_KEY")
    
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

def main():
    validate_env()
    
    logger.info(f"Starting Qdrant setup for analysis_id={ANALYSIS_ID}")

    # 1. Connect to Supabase
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        logger.error(f"Failed to connect to Supabase: {e}")
        sys.exit(1)

    # 2. Fetch the analysis to get the slug
    logger.info("Querying analyses table for slug...")
    try:
        result = (
            supabase.table("analyses")
            .select("id, slug")
            .eq("id", ANALYSIS_ID)
            .single()
            .execute()
        )
        analysis = result.data
        if not analysis:
            logger.error(f"Analysis {ANALYSIS_ID} not found.")
            sys.exit(1)
        
        slug = analysis["slug"].strip()
        logger.info(f"Found analysis slug: {slug}")
        
    except Exception as e:
        logger.error(f"Error fetching analysis: {e}")
        sys.exit(1)

    # 3. Connect to Qdrant
    try:
        qdrant_client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY
        )
        logger.info("Connected to Qdrant Cloud")
    except Exception as e:
        logger.error(f"Failed to connect to Qdrant: {e}")
        mark_failed(supabase, ANALYSIS_ID, f"Error conectando a Qdrant: {e}", EVENT_SOURCE)
        sys.exit(1)

    # 4. Recreate Collection
    collection_name = slug
    
    try:
        if qdrant_client.collection_exists(collection_name):
            logger.info(f"Collection '{collection_name}' exists. Deleting...")
            qdrant_client.delete_collection(collection_name)
            logger.info(f"Collection '{collection_name}' deleted.")
            log_event(supabase, ANALYSIS_ID, "info", f"Colección Qdrant eliminada: {collection_name}", EVENT_SOURCE)

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
        
        # 5. Create Payload Indexes
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
        
        log_event(supabase, ANALYSIS_ID, "info", f"Colección Qdrant configurada: {collection_name}", EVENT_SOURCE)
        
    except Exception as e:
        logger.error(f"Error configuring Qdrant collection: {e}")
        mark_failed(supabase, ANALYSIS_ID, f"Error configurando Qdrant: {e}", EVENT_SOURCE)
        sys.exit(1)
        
    logger.info("Qdrant setup service complete ✓")

if __name__ == "__main__":
    main()
