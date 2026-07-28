"""
Supabase Logger
===============
Shared logging and event-tracking utilities for all services.
Provides a consistent way to log events via the backend API
and manage workflow steps in Supabase.
"""

import os
import pathlib
import logging

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------------------------------------------------------------------
# API Configuration for events
# ---------------------------------------------------------------------------
API_BASE_URL = os.environ["API_BASE_URL"]
API_KEY = os.environ["API_KEY"]
API_EVENTS_PATH = os.environ["API_EVENTS_PATH"]


def _read_system_version() -> str:
    """Read the unified system version baked into the image.

    In the container the VERSION file sits next to this module (Dockerfile
    COPYs both into /app). In local dev it lives at the services repo root,
    one level up from global/. Falls back to env var then "dev".
    """
    here = pathlib.Path(__file__).resolve().parent
    for candidate in (here / "VERSION", here.parent / "VERSION"):
        try:
            return candidate.read_text().strip()
        except OSError:
            continue
    return os.environ.get("SYSTEM_VERSION", "dev")


SYSTEM_VERSION = _read_system_version()


def make_session() -> requests.Session:
    """Create a requests.Session with automatic retry and exponential backoff.

    Retries up to 3 times on HTTP 429/5xx responses, waiting 2s, 4s, 8s
    between attempts (backoff_factor=2). Handles Vercel rate limiting gracefully.
    """
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


_session = make_session()


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
        "source": f"{source} v{SYSTEM_VERSION}",
    }
    if details:
        payload["details"] = details
    try:
        url = f"{API_BASE_URL}{API_EVENTS_PATH}"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        }
        response = _session.post(url, json=payload, headers=headers, timeout=10)
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



