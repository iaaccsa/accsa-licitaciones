"""
AI Usage Logger
===============
Shared helper to record AI token/page usage and frozen cost for each
LLM / embedding / OCR call, via the backend API.

Flow per service:
  1. At startup call `load_pricing()` once -> dict keyed by
     (provider, model, operation) with the frozen price snapshot.
  2. After each provider call, extract units (see `openai_units` /
     `gemini_units` helpers) and call `record_usage(...)`. Cost is computed
     here from the loaded snapshot and frozen at insert time.

Fail-soft: a logging failure never breaks the pipeline; it only warns.
"""

import os
import logging

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API_BASE_URL = os.environ["API_BASE_URL"]
API_KEY = os.environ["API_KEY"]
API_PRICING_PATH = os.environ["API_PRICING_PATH"]
API_USAGE_PATH = os.environ["API_USAGE_PATH"]


def _make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


_session = _make_session()
_logger = logging.getLogger(__name__)


def load_pricing() -> dict:
    """Fetch the active price snapshot once. Returns a dict keyed by
    (provider, model, operation) -> price row. Empty dict on failure."""
    try:
        url = f"{API_BASE_URL}{API_PRICING_PATH}"
        headers = {"X-API-Key": API_KEY}
        response = _session.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        rows = response.json()
        return {(r["provider"], r["model"], r["operation"]): r for r in rows}
    except Exception as e:
        _logger.warning(f"Failed to load ai_pricing: {e}")
        return {}


def _compute_cost(row: dict, input_units: float, output_units: float, cached_input_units: float) -> float:
    scale = row["unit_scale"]
    if not scale:
        return 0.0
    in_price = row["input_price"] or 0
    out_price = row["output_price"] or 0
    cached_price = row.get("cached_input_price")
    billable_input = max(input_units - cached_input_units, 0)
    cost = (billable_input / scale) * in_price + (output_units / scale) * out_price
    if cached_input_units:
        cost += (cached_input_units / scale) * (cached_price if cached_price is not None else in_price)
    return cost


def record_usage(
    analysis_id: str,
    service_name: str,
    provider: str,
    model: str,
    operation: str,
    input_units: float = 0,
    output_units: float = 0,
    cached_input_units: float = 0,
    pricing: dict | None = None,
    attempt: int = 1,
    success: bool = True,
    proposal_id: str | None = None,
) -> None:
    """Compute frozen cost from the loaded `pricing` snapshot and POST one
    usage row to the backend. `pricing` is the dict from `load_pricing()`."""
    row = (pricing or {}).get((provider, model, operation))
    model_found = row is not None

    if model_found:
        cost_usd = _compute_cost(row, input_units, output_units, cached_input_units)
        payload = {
            "analysis_id": analysis_id,
            "proposal_id": proposal_id,
            "service_name": service_name,
            "provider": provider,
            "model": model,
            "operation": operation,
            "unit_type": row["unit_type"],
            "unit_scale": row["unit_scale"],
            "input_units": input_units,
            "output_units": output_units,
            "cached_input_units": cached_input_units,
            "input_price": row["input_price"],
            "output_price": row["output_price"],
            "cached_input_price": row.get("cached_input_price"),
            "cost_usd": cost_usd,
            "attempt": attempt,
            "success": success,
            "model_found": True,
        }
    else:
        _logger.warning(f"No ai_pricing for ({provider}, {model}, {operation}); recording cost 0.")
        payload = {
            "analysis_id": analysis_id,
            "proposal_id": proposal_id,
            "service_name": service_name,
            "provider": provider,
            "model": model,
            "operation": operation,
            "unit_type": "tokens",
            "unit_scale": 1,
            "input_units": input_units,
            "output_units": output_units,
            "cached_input_units": cached_input_units,
            "input_price": 0,
            "output_price": 0,
            "cached_input_price": None,
            "cost_usd": 0,
            "attempt": attempt,
            "success": success,
            "model_found": False,
        }

    try:
        url = f"{API_BASE_URL}{API_USAGE_PATH}"
        headers = {"Content-Type": "application/json", "X-API-Key": API_KEY}
        response = _session.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
    except Exception as e:
        _logger.warning(f"Failed to record ai_usage via API: {e}")


def openai_units(response) -> tuple:
    """Extract (input_units, output_units, cached_input_units) from an OpenAI
    chat/embeddings response. Missing fields default to 0."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0, 0, 0
    input_units = getattr(usage, "prompt_tokens", 0) or 0
    output_units = getattr(usage, "completion_tokens", 0) or 0
    details = getattr(usage, "prompt_tokens_details", None)
    cached = getattr(details, "cached_tokens", 0) if details else 0
    return input_units, output_units, (cached or 0)


def gemini_units(response) -> tuple:
    """Extract (input_units, output_units, cached_input_units) from a Gemini
    generate_content response. Missing fields default to 0.

    Thinking tokens are reported apart from the answer, in `thoughts_token_count`,
    but Google bills them as output, so they are added here. They are not a
    rounding error: gemini-3.6-flash answering in 134 tokens spent 705 thinking.
    """
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return 0, 0, 0
    input_units = getattr(meta, "prompt_token_count", 0) or 0
    answer_units = getattr(meta, "candidates_token_count", 0) or 0
    thinking_units = getattr(meta, "thoughts_token_count", 0) or 0
    cached = getattr(meta, "cached_content_token_count", 0) or 0
    return input_units, answer_units + thinking_units, cached
