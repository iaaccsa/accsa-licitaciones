"""
Supabase Logger
===============
Shared logging and event-tracking utilities for all services.
Provides a consistent way to log events to the Supabase `events` table
and mark analyses as failed.
"""

import logging
from supabase import Client


def setup_logger(name: str) -> logging.Logger:
    """Create and configure a logger with a standard format."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger(name)


def log_event(
    supabase: Client,
    analysis_id: str,
    level: str,
    message: str,
    source: str,
    details: dict | None = None,
):
    """Insert an event row into the events table."""
    logger = logging.getLogger(__name__)
    payload = {
        "analysis_id": analysis_id,
        "level": level,
        "message": message,
        "source": source,
    }
    if details:
        payload["details"] = details
    try:
        supabase.table("events").insert(payload).execute()
    except Exception as e:
        logger.warning(f"Failed to log event to Supabase: {e}")


def mark_failed(
    supabase: Client,
    analysis_id: str,
    error_msg: str,
    source: str,
):
    """Log an error event for the analysis."""
    logger = logging.getLogger(__name__)
    logger.error(error_msg)
    log_event(supabase, analysis_id, "error", error_msg, source)


def log_workflow_step(
    supabase: Client,
    analysis_id: str,
    proposal_id: str | None,
    code: str,
    display_name: str,
    status: str,
    started_at: str,
    parent_step_id: str,
    ended_at: str | None = None,
    error_log: str | None = None,
):
    """Upsert a workflow step record into analysis_workflow_steps."""
    logger = logging.getLogger(__name__)
    payload = {
        "analysis_id": analysis_id,
        "proposal_id": proposal_id,
        "code": code,
        "display_name": display_name,
        "status": status,
        "started_at": started_at,
        "ended_at": ended_at,
        "error_log": error_log,
        "parent_step_id": parent_step_id,
    }
    
    # Remove None values to let DB defaults handling them or to avoid issues if not nullable
    # But user spec says ended_at: null, error_log: null explicitly.
    # Supabase/Postgrest handles JSON nulls as SQL NULLs usually.
    
    try:
        # Upsert based on analysis_id and code (conflict resolution)
        # Assuming the table has a unique constraint on (analysis_id, code)
        supabase.table("analysis_workflow_steps").upsert(
            payload, on_conflict="analysis_id, code"
        ).execute()
        logger.info(f"Upserted workflow step: {code} (status={status})")
    except Exception as e:
        logger.warning(f"Failed to log workflow step to Supabase: {e}")
