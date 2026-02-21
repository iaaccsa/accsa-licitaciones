"""
Supabase Logger
===============
Shared logging and event-tracking utilities for all services.
Provides a consistent way to log events via the backend API
and manage workflow steps in Supabase.
"""

import os
import logging

import requests
 
# ---------------------------------------------------------------------------
# API Configuration for events
# ---------------------------------------------------------------------------
API_BASE_URL = os.environ.get("API_BASE_URL", "")
API_KEY = os.environ.get("API_KEY", "")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH", "/api/v1/events/")


def setup_logger(name: str) -> logging.Logger:
    """Create and configure a logger with a standard format."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger(name)


def log_event(
    analysis_id: str,
    level: str,
    message: str,
    source: str,
    details: dict | None = None,
):
    """Post an event to the backend API."""
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
        url = f"{API_BASE_URL}{API_EVENTS_PATH}"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        }
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
    except Exception as e:
        logger.warning(f"Failed to log event via API: {e}")


def mark_failed(
    analysis_id: str,
    error_msg: str,
    source: str,
):
    """Log an error event for the analysis."""
    logger = logging.getLogger(__name__)
    logger.error(error_msg)
    log_event(analysis_id, "error", error_msg, source)



