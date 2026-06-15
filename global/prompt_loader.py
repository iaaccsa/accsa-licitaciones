import os

import requests

API_BASE_URL = os.environ.get("API_BASE_URL", "")
API_KEY = os.environ.get("API_KEY", "")
API_PROMPTS_PATH = os.environ.get("API_PROMPTS_PATH", "/api/v1/prompts")


def load_prompt(key: str) -> str:
    """Fetch a prompt body from the API at runtime. No fallback: any failure
    propagates and the job fails (the DB is the authoritative source)."""
    url = f"{API_BASE_URL}{API_PROMPTS_PATH}/{key}"
    resp = requests.get(url, headers={"X-API-Key": API_KEY}, timeout=15)
    resp.raise_for_status()
    body = resp.json().get("body")
    if not body:
        raise RuntimeError(f"empty prompt body for {key}")
    return body
