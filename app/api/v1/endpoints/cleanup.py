from fastapi import APIRouter, HTTPException
from app.core.supabase import supabase
from app.core.qdrant import qdrant_client
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _collect_bucket_paths(bucket_name: str, prefix: str = "") -> list:
    items = supabase.storage.from_(bucket_name).list(prefix) if prefix else supabase.storage.from_(bucket_name).list()
    paths = []
    for item in items:
        full_path = f"{prefix}/{item['name']}" if prefix else item["name"]
        if item.get("id") is None:
            # folder — recurse
            paths.extend(_collect_bucket_paths(bucket_name, full_path))
        else:
            paths.append(full_path)
    return paths


@router.post("/")
def cleanup_all():
    """
    Delete all analyses (cascades to related tables), empty both storage buckets,
    and delete all Qdrant collections.
    """
    results = {
        "analyses": None,
        "storage": {},
        "qdrant": None,
    }

    # 1. Delete all analyses (CASCADE deletes files, events, proposals, jobs, etc.)
    try:
        response = supabase.table("analyses").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        results["analyses"] = f"deleted {len(response.data)} analyses"
    except Exception as e:
        logger.error(f"Error deleting analyses: {e}")
        results["analyses"] = f"error: {str(e)}"

    # 2. Empty storage buckets
    for bucket_name in ["artifacts", "files"]:
        try:
            all_paths = _collect_bucket_paths(bucket_name)
            if all_paths:
                supabase.storage.from_(bucket_name).remove(all_paths)
            results["storage"][bucket_name] = f"deleted {len(all_paths)} files"
        except Exception as e:
            logger.error(f"Error cleaning bucket {bucket_name}: {e}")
            results["storage"][bucket_name] = f"error: {str(e)}"

    # 3. Delete all Qdrant collections
    try:
        collections = qdrant_client.get_collections().collections
        for collection in collections:
            qdrant_client.delete_collection(collection.name)
        results["qdrant"] = f"deleted {len(collections)} collections"
    except Exception as e:
        logger.error(f"Error deleting Qdrant collections: {e}")
        results["qdrant"] = f"error: {str(e)}"

    return results
