import os
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from google import genai
from google.genai import types as genai_types
from openai import OpenAI
from pydantic import BaseModel

try:
    from supabase_logger import setup_logger, log_event, make_session
    from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage
    from prompt_loader import load_prompt
except ImportError:
    import logging

    def setup_logger(name):
        logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
        return logging.getLogger(name)

    def log_event(analysis_id, level, message, source, details=None):
        pass

    def make_session():
        import requests
        return requests.Session()

    def load_pricing():
        return {}

    def record_usage(*args, **kwargs):
        pass

    def openai_units(response):
        return 0, 0, 0

    def gemini_units(response):
        return 0, 0, 0

    def load_prompt(key):
        raise RuntimeError(f"prompt_loader unavailable; cannot load prompt '{key}'")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GOOGLE_API_KEY                  = os.environ.get("GOOGLE_API_KEY")
OPENAI_API_KEY                  = os.environ.get("OPENAI_API_KEY")
API_BASE_URL                    = os.environ.get("API_BASE_URL")
API_KEY                         = os.environ.get("API_KEY")
API_EVENTS_PATH                 = os.environ.get("API_EVENTS_PATH")
API_PROPOSALS_PATH              = os.environ.get("API_PROPOSALS_PATH")
API_ANALYSIS_REQUIREMENTS_PATH  = os.environ.get("API_ANALYSIS_REQUIREMENTS_PATH")
API_COMPLIANCE_MATRIX_PATH      = os.environ.get("API_COMPLIANCE_MATRIX_PATH")
API_JOBS_CALLBACK               = os.environ.get("API_JOBS_CALLBACK")
API_ANALYSES_PATH               = os.environ.get("API_ANALYSES_PATH", "/api/v1/analyses")
ANALYSIS_ID                     = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID                     = os.environ.get("PROPOSAL_ID")

SERVICE_NAME          = "service-compliance-summarizer"
EVENT_SOURCE          = f"ACA: {SERVICE_NAME}"
GEMINI_MODEL          = "gemini-2.5-flash"
OPENAI_FALLBACK_MODEL = "gpt-4.1-mini"

# Model selection, resolved at runtime from the analysis (see resolve_model_config).
# Defaults preserve the prior hardcoded behavior if the API is unreachable.
PRIMARY_PROVIDER = "gemini"
PRIMARY_MODEL = GEMINI_MODEL
FALLBACK_PROVIDER = "openai"
FALLBACK_MODEL = OPENAI_FALLBACK_MODEL

# AI cost accounting: frozen price snapshot, loaded once in main().
PRICING: dict = {}


def _provider_of(model_id: str) -> str:
    return "gemini" if str(model_id).startswith("gemini") else "openai"

LLM_RETRY_ATTEMPTS    = 2
LLM_RETRY_BACKOFF     = 2.0

TOP_CRITICAL_FAILURES = 10
TOP_NO_CUMPLE         = 5
TOP_CUMPLE_PARCIAL    = 5
TOP_STRENGTHS         = 5

logger  = setup_logger(SERVICE_NAME)
SESSION = make_session()

# ---------------------------------------------------------------------------
# Pydantic model
# ---------------------------------------------------------------------------
class SummaryMetrics(BaseModel):
    compliance_rate:         Optional[Decimal]
    compliance_counts:       Dict[str, int]
    critical_failures_count: int


# ---------------------------------------------------------------------------
# LLM prompts
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = None  # loaded at runtime in main() via load_prompt


def build_user_prompt(
    proposal: dict,
    metrics: SummaryMetrics,
    critical_failures: List[dict],
    other_no_cumple: List[dict],
    partial: List[dict],
    strengths: List[dict],
) -> str:
    applicable_total = (
        sum(metrics.compliance_counts.values())
        - metrics.compliance_counts.get("no_aplica", 0)
    )
    rate_str = (
        f"{metrics.compliance_rate} %"
        if metrics.compliance_rate is not None
        else "N/A (sin requisitos aplicables)"
    )
    counts = metrics.compliance_counts

    def fmt_no_cumple(e: dict) -> str:
        return (
            f"- [{e.get('requirement_code', '')}] {e.get('requirement_text', '')}\n"
            f"  Razonamiento: {e.get('reasoning', '')}"
        )

    def fmt_partial(e: dict) -> str:
        missing = ", ".join(e.get("missing_elements") or [])
        return (
            f"- [{e.get('requirement_code', '')}] {e.get('requirement_text', '')}\n"
            f"  Faltante: {missing}\n"
            f"  Razonamiento: {e.get('reasoning', '')}"
        )

    def fmt_strength(e: dict) -> str:
        return f"- [{e.get('requirement_code', '')}] {e.get('requirement_text', '')}"

    sections = [
        "<bidder>",
        f"label: {proposal.get('label', '')}",
        f"provider: {proposal.get('provider_name', '')}",
        "</bidder>",
        "",
        "<metrics>",
        f"compliance_rate: {rate_str}",
        f"applicable_total: {applicable_total}",
        f"critical_failures_count: {metrics.critical_failures_count}",
        "compliance_counts:",
        f"  cumple: {counts.get('cumple', 0)}",
        f"  cumple_parcial: {counts.get('cumple_parcial', 0)}",
        f"  no_cumple: {counts.get('no_cumple', 0)}",
        f"  no_evidencia: {counts.get('no_evidencia', 0)}",
        f"  no_aplica: {counts.get('no_aplica', 0)}",
        f"  requiere_verificacion_manual: {counts.get('requiere_verificacion_manual', 0)}",
        "</metrics>",
        "",
        "<critical_failures>",
        *([fmt_no_cumple(e) for e in critical_failures] if critical_failures else ["(ninguna)"]),
        "</critical_failures>",
        "",
        "<other_no_cumple>",
        *([fmt_no_cumple(e) for e in other_no_cumple] if other_no_cumple else ["(ninguna)"]),
        "</other_no_cumple>",
        "",
        "<cumple_parcial>",
        *([fmt_partial(e) for e in partial] if partial else ["(ninguna)"]),
        "</cumple_parcial>",
        "",
        "<strengths>",
        *([fmt_strength(e) for e in strengths] if strengths else ["(ninguna)"]),
        "</strengths>",
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data=None):
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=60)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def resolve_model_config():
    """Resolve the LLM model for this analysis from the API (global config snapshot)
    and log a startup event. On any failure keep the hardcoded defaults."""
    global PRIMARY_PROVIDER, PRIMARY_MODEL, FALLBACK_PROVIDER, FALLBACK_MODEL
    level = None
    origin = "configuracion global"
    try:
        cfg = api_request("GET", f"{API_ANALYSES_PATH}/{ANALYSIS_ID}/model-config")
        if cfg:
            PRIMARY_PROVIDER = cfg.get("provider") or PRIMARY_PROVIDER
            PRIMARY_MODEL = cfg.get("model_id") or PRIMARY_MODEL
            level = cfg.get("level")
            fb = cfg.get("fallback_model_id")
            if fb:
                FALLBACK_MODEL = fb
                FALLBACK_PROVIDER = _provider_of(fb)
    except Exception as e:
        origin = f"valores por defecto (model-config no disponible: {e})"
    msg = (
        f"Modelo LLM: {PRIMARY_MODEL} (proveedor {PRIMARY_PROVIDER}"
        + (f", nivel {level}" if level else "")
        + f"); fallback {FALLBACK_MODEL}. Origen: {origin}."
    )
    log_event(ANALYSIS_ID, "info", msg, EVENT_SOURCE)


def validate_env():
    missing = [
        var for var, val in [
            ("GOOGLE_API_KEY",                 GOOGLE_API_KEY),
            ("OPENAI_API_KEY",                 OPENAI_API_KEY),
            ("API_BASE_URL",                   API_BASE_URL),
            ("API_KEY",                        API_KEY),
            ("API_EVENTS_PATH",                API_EVENTS_PATH),
            ("API_PROPOSALS_PATH",             API_PROPOSALS_PATH),
            ("API_ANALYSIS_REQUIREMENTS_PATH", API_ANALYSIS_REQUIREMENTS_PATH),
            ("API_COMPLIANCE_MATRIX_PATH",     API_COMPLIANCE_MATRIX_PATH),
            ("API_JOBS_CALLBACK",              API_JOBS_CALLBACK),
            ("ANALYSIS_ID",                    ANALYSIS_ID),
            ("PROPOSAL_ID",                    PROPOSAL_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------
def mark_summary_start(proposal_id: str):
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/summary-start", {
        "summarizing_started_at": now,
    })
    logger.info(f"Proposal {proposal_id} transitioned to summarizing.")


def mark_summary_result(proposal_id: str, metrics: SummaryMetrics, summary_text: str):
    now = datetime.now(timezone.utc).isoformat()
    rate = float(metrics.compliance_rate) if metrics.compliance_rate is not None else None
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/summary-result", {
        "summarizing_completed_at": now,
        "compliance_rate":          rate,
        "compliance_counts":        metrics.compliance_counts,
        "compliance_summary":       summary_text,
        "critical_failures_count":  metrics.critical_failures_count,
    })
    logger.info(f"Proposal {proposal_id} transitioned to completed.")


def mark_summary_failure(proposal_id: str, error: str):
    now = datetime.now(timezone.utc).isoformat()
    try:
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/summary-failure", {
            "summarizing_completed_at": now,
            "summary_error":            error,
        })
    except Exception as e:
        logger.error(f"Failed to mark summary-failure: {e}")


def notify_success():
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id":  ANALYSIS_ID,
            "proposal_id":  PROPOSAL_ID,
            "status":       "success",
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def notify_failure(error_msg: str):
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name":  SERVICE_NAME,
            "analysis_id":   ANALYSIS_ID,
            "proposal_id":   PROPOSAL_ID,
            "status":        "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


# ---------------------------------------------------------------------------
# Data loading (paginated)
# ---------------------------------------------------------------------------
def load_all_pages(path: str) -> List[dict]:
    results: List[dict] = []
    offset = 0
    limit  = 100
    while True:
        sep  = "&" if "?" in path else "?"
        page = api_request("GET", f"{path}{sep}limit={limit}&offset={offset}")
        if not isinstance(page, list):
            raise RuntimeError(f"Unexpected paginated response from {path}: {type(page)}")
        results.extend(page)
        if len(page) < limit:
            break
        offset += len(page)
    return results


def load_proposal(proposal_id: str) -> dict:
    result = api_request("GET", f"{API_PROPOSALS_PATH}{proposal_id}")
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response from proposals: {type(result)}")
    return result


def load_requirements(analysis_id: str) -> List[dict]:
    return load_all_pages(f"{API_ANALYSIS_REQUIREMENTS_PATH}{analysis_id}")


def load_compliance_matrix(proposal_id: str) -> List[dict]:
    return load_all_pages(f"{API_COMPLIANCE_MATRIX_PATH}by-proposal/{proposal_id}")


# ---------------------------------------------------------------------------
# Metrics computation (deterministic, no LLM)
# ---------------------------------------------------------------------------
def compute_metrics(
    entries: List[dict],
    requirements_by_id: Dict[str, dict],
) -> Tuple[Optional[Decimal], Dict[str, int], int]:
    counts: Dict[str, int] = {
        "cumple":                       0,
        "cumple_parcial":               0,
        "no_cumple":                    0,
        "no_evidencia":                 0,
        "no_aplica":                    0,
        "requiere_verificacion_manual": 0,
    }
    critical_failures_count = 0

    for e in entries:
        verdict = e.get("verdict", "")
        if verdict in counts:
            counts[verdict] += 1
        if verdict == "no_cumple":
            req = e.get("requirement") or requirements_by_id.get(str(e.get("requirement_id", "")))
            if req and "admisibilidad_obligatoria" in (req.get("roles") or []):
                critical_failures_count += 1

    applicable_total = sum(counts.values()) - counts["no_aplica"]

    if applicable_total == 0:
        compliance_rate = None
    else:
        numerator = counts["cumple"] + 0.5 * counts["cumple_parcial"]
        compliance_rate = Decimal(str(round((numerator / applicable_total) * 100, 2)))

    return compliance_rate, counts, critical_failures_count


# ---------------------------------------------------------------------------
# Example selection for LLM prompt
# ---------------------------------------------------------------------------
def _get_req(entry: dict, requirements_by_id: Dict[str, dict]) -> dict:
    return entry.get("requirement") or requirements_by_id.get(str(entry.get("requirement_id", ""))) or {}


def _to_llm_dict(entry: dict, req: dict) -> dict:
    return {
        "requirement_code": req.get("requirement_code") or str(req.get("id", "")),
        "requirement_text": req.get("requirement_text", ""),
        "reasoning":        entry.get("reasoning", ""),
        "missing_elements": entry.get("missing_elements") or [],
    }


def select_examples(
    entries: List[dict],
    requirements_by_id: Dict[str, dict],
) -> Tuple[List[dict], List[dict], List[dict], List[dict]]:
    critical_ids: set = set()
    critical_failures: List[dict] = []
    for e in entries:
        if e.get("verdict") != "no_cumple":
            continue
        req = _get_req(e, requirements_by_id)
        if "admisibilidad_obligatoria" in (req.get("roles") or []):
            critical_ids.add(e.get("requirement_id"))
            critical_failures.append(_to_llm_dict(e, req))
            if len(critical_failures) >= TOP_CRITICAL_FAILURES:
                break

    other_no_cumple: List[dict] = []
    for e in entries:
        if e.get("verdict") != "no_cumple":
            continue
        if e.get("requirement_id") in critical_ids:
            continue
        req = _get_req(e, requirements_by_id)
        other_no_cumple.append(_to_llm_dict(e, req))
        if len(other_no_cumple) >= TOP_NO_CUMPLE:
            break

    partial_puntuable: List[dict] = []
    partial_other:     List[dict] = []
    for e in entries:
        if e.get("verdict") != "cumple_parcial":
            continue
        req = _get_req(e, requirements_by_id)
        d   = _to_llm_dict(e, req)
        if "puntuable" in (req.get("roles") or []):
            partial_puntuable.append(d)
        else:
            partial_other.append(d)
    partial = (partial_puntuable + partial_other)[:TOP_CUMPLE_PARCIAL]

    strengths_puntuable: List[dict] = []
    strengths_fill:      List[dict] = []
    for e in entries:
        if e.get("verdict") != "cumple":
            continue
        req   = _get_req(e, requirements_by_id)
        roles = req.get("roles") or []
        d     = _to_llm_dict(e, req)
        if "puntuable" in roles:
            strengths_puntuable.append(d)
        elif "informativo" not in roles:
            strengths_fill.append(d)
    strengths = (strengths_puntuable + strengths_fill)[:TOP_STRENGTHS]

    return critical_failures, other_no_cumple, partial, strengths


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------
def _call_gemini_summary(gemini: genai.Client, user_prompt: str, model: str) -> str:
    response = gemini.models.generate_content(
        model=model,
        contents=[
            genai_types.Content(role="user",  parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
            genai_types.Content(role="model", parts=[genai_types.Part(text="Entendido. Generare solo el texto del resumen.")]),
            genai_types.Content(role="user",  parts=[genai_types.Part(text=user_prompt)]),
        ],
        config=genai_types.GenerateContentConfig(
            response_mime_type="text/plain",
        ),
    )
    in_u, out_u, cached = gemini_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "gemini", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached,
                 pricing=PRICING, proposal_id=PROPOSAL_ID)
    return response.text.strip()


def _call_openai_summary(openai_client: OpenAI, user_prompt: str, model: str) -> str:
    response = openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
    )
    in_u, out_u, cached = openai_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "openai", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached,
                 pricing=PRICING, proposal_id=PROPOSAL_ID)
    return response.choices[0].message.content.strip()


def _call_summary(gemini: genai.Client, openai_client: OpenAI, user_prompt: str, provider: str, model: str) -> str:
    if provider == "gemini":
        return _call_gemini_summary(gemini, user_prompt, model)
    return _call_openai_summary(openai_client, user_prompt, model)


def call_llm_summary(
    gemini: genai.Client,
    openai_client: OpenAI,
    user_prompt: str,
) -> str:
    last_error: Optional[Exception] = None
    for attempt in range(LLM_RETRY_ATTEMPTS + 1):
        try:
            text = _call_summary(gemini, openai_client, user_prompt, PRIMARY_PROVIDER, PRIMARY_MODEL)
            logger.info(f"Summary generated by primary {PRIMARY_PROVIDER}/{PRIMARY_MODEL} on attempt {attempt}.")
            return text
        except Exception as e_primary:
            logger.warning(f"Attempt {attempt}: primary {PRIMARY_PROVIDER}/{PRIMARY_MODEL} failed ({e_primary}), trying fallback {FALLBACK_PROVIDER}/{FALLBACK_MODEL}...")
            try:
                text = _call_summary(gemini, openai_client, user_prompt, FALLBACK_PROVIDER, FALLBACK_MODEL)
                logger.info(f"Summary generated by fallback {FALLBACK_PROVIDER}/{FALLBACK_MODEL} on attempt {attempt}.")
                return text
            except Exception as e_fallback:
                last_error = e_fallback
                logger.warning(f"Attempt {attempt}: fallback {FALLBACK_PROVIDER}/{FALLBACK_MODEL} also failed ({e_fallback}).")
                if attempt < LLM_RETRY_ATTEMPTS:
                    time.sleep(LLM_RETRY_BACKOFF)
    raise RuntimeError(
        f"Both LLMs failed after {LLM_RETRY_ATTEMPTS + 1} attempts: {last_error}"
    )


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_summary():
    logger.info(
        f"Starting compliance-summarizer for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}"
    )

    mark_summary_start(PROPOSAL_ID)

    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    try:
        log_event(
            ANALYSIS_ID, "info",
            f"Iniciando compliance summarization para propuesta {PROPOSAL_ID}...",
            EVENT_SOURCE,
        )

        proposal = load_proposal(PROPOSAL_ID)
        state    = proposal.get("matching_status") or proposal.get("status")
        if state != "summarizing":
            raise RuntimeError(
                f"Proposal {PROPOSAL_ID} is in state '{state}', expected 'summarizing'. "
                "Aborting to avoid race condition."
            )

        requirements       = load_requirements(ANALYSIS_ID)
        requirements_by_id = {str(r["id"]): r for r in requirements}
        logger.info(f"Loaded {len(requirements)} requirements.")

        entries = load_compliance_matrix(PROPOSAL_ID)
        logger.info(f"Loaded {len(entries)} compliance matrix entries.")

        compliance_rate, counts, critical_failures_count = compute_metrics(
            entries, requirements_by_id
        )
        metrics = SummaryMetrics(
            compliance_rate=compliance_rate,
            compliance_counts=counts,
            critical_failures_count=critical_failures_count,
        )
        logger.info(
            f"Metrics: rate={compliance_rate}, critical_failures={critical_failures_count}, counts={counts}"
        )

        critical_ex, other_nc_ex, partial_ex, strength_ex = select_examples(
            entries, requirements_by_id
        )

        user_prompt  = build_user_prompt(
            proposal, metrics, critical_ex, other_nc_ex, partial_ex, strength_ex
        )
        summary_text = call_llm_summary(gemini_client, openai_client, user_prompt)

        if not summary_text or len(summary_text) < 80:
            raise ValueError(f"Summary too short ({len(summary_text)} chars). Likely an LLM error.")
        if len(summary_text) > 3000:
            logger.warning(f"Summary truncated from {len(summary_text)} to 3000 chars.")
            summary_text = summary_text[:3000]

        mark_summary_result(PROPOSAL_ID, metrics, summary_text)

        log_event(
            ANALYSIS_ID, "info",
            (
                f"Compliance summarization completada para propuesta "
                f"{proposal.get('label', PROPOSAL_ID)}: "
                f"rate={compliance_rate}%, critical_failures={critical_failures_count}"
            ),
            EVENT_SOURCE,
            {
                "proposal_id":             PROPOSAL_ID,
                "compliance_rate":         float(compliance_rate) if compliance_rate is not None else None,
                "critical_failures_count": critical_failures_count,
                "total_entries":           len(entries),
            },
        )

        notify_success()

    except Exception as e:
        mark_summary_failure(PROPOSAL_ID, str(e))
        raise


def main():
    global PRICING, SYSTEM_PROMPT
    validate_env()
    SYSTEM_PROMPT = load_prompt("service-compliance-summarizer/compliance_summary")
    resolve_model_config()
    PRICING = load_pricing()
    try:
        process_summary()
    except Exception as e:
        notify_failure(f"Failed during compliance summarization: {e}")
        sys.exit(0)


if __name__ == "__main__":
    main()
