"""
Admissibility Extractor Service
===============================
Extracts admissibility requirements (excluyentes: obligatoria / subsanable) from
a unified tender document already indexed in Qdrant, deduplicates across batches,
assigns ADM-nnn codes and persists the result via the backend API.

Runs a single LLM pass per batch with a dedicated admissibility prompt. It does
NOT read the evaluation_profile and has no dependency on service-tender-classifier;
the general (7-axis) extraction lives in service-requirement-extractor.

Required environment variables:
  - GOOGLE_API_KEY
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROCESSED_FILES_PATH
  - API_ADMISSIBILITY_REQUIREMENTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Annotated, Any, Callable, Dict, List, Literal, Optional, Tuple

import requests
from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage
from prompt_loader import load_prompt
from google import genai
from google.genai import types as genai_types
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from qdrant_client import QdrantClient
from supabase_logger import log_event, make_session, setup_logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_ADMISSIBILITY_REQUIREMENTS_PATH = os.environ.get(
    "API_ADMISSIBILITY_REQUIREMENTS_PATH"
)
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-admissibility-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"

# Models and the reasoning each call must carry, resolved at runtime by
# resolve_model_config. No defaults on purpose: nothing runs unconfigured.
PRIMARY_PROVIDER = None
PRIMARY_MODEL = None
FALLBACK_PROVIDER = None
FALLBACK_MODEL = None
# Keyed by provider: goes to `reasoning_effort` on OpenAI and to `thinking_level`
# on Gemini.
REASONING: dict = {}

# AI cost accounting: frozen price snapshot, loaded once in main().
PRICING: dict = {}


BATCH_SIZE = 15
BATCH_OVERLAP = 2
MAX_PARALLEL_BATCHES = 5
SCROLL_PAGE_SIZE = 256
MAX_FAILED_BATCH_RATIO = 0.10
MAX_LLM_RETRIES = 3
LLM_RETRY_BASE_DELAY = 1.0
PROVIDER_UNAVAILABLE_STATUS_CODES = {429, 500, 502, 503, 504}
UNAVAILABLE_MAX_ATTEMPTS = 2
UNAVAILABLE_RETRY_DELAY = 10.0

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()

# ---------------------------------------------------------------------------
# Constrained value types
# ---------------------------------------------------------------------------
AdmissibilityRole = Literal["admisibilidad_obligatoria", "admisibilidad_subsanable"]

RequirementVerificationMethod = Literal[
    "attached_document",
    "sworn_statement",
    "external_certificate",
    "inspection",
    "sample",
    "site_visit",
    "auto_verifiable_from_offer",
    "other",
]

RequirementDomain = Literal[
    "technical",
    "administrative",
    "legal",
    "financial",
    "hr",
    "logistics",
    "environmental",
    "quality",
    "safety",
    "other",
]

RequirementTemporalScope = Literal[
    "at_bid_time",
    "pre_award",
    "during_execution",
    "post_sale",
    "other",
]


# ---------------------------------------------------------------------------
# Literal alias maps (Spanish/variants -> canonical) and normalizer
# ---------------------------------------------------------------------------
def _strip_accents(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def _make_normalizer(aliases: Dict[str, str], allowed: set):
    def _normalize(value):
        if not isinstance(value, str):
            return value
        norm = _strip_accents(value).lower().strip()
        if norm in allowed:
            return norm
        if norm in aliases:
            return aliases[norm]
        return value

    return _normalize


ROLE_ALIASES: Dict[str, str] = {
    "obligatorio": "admisibilidad_obligatoria",
    "obligatoria": "admisibilidad_obligatoria",
    "admisibilidad": "admisibilidad_obligatoria",
    "subsanable": "admisibilidad_subsanable",
}
ROLE_ALLOWED = {
    "admisibilidad_obligatoria",
    "admisibilidad_subsanable",
}
DOMAIN_ALIASES: Dict[str, str] = {
    "tecnico": "technical",
    "tecnica": "technical",
    "tecnicos": "technical",
    "administrativo": "administrative",
    "administrativa": "administrative",
    "administrativos": "administrative",
    "legal": "legal",
    "juridico": "legal",
    "juridica": "legal",
    "financiero": "financial",
    "financiera": "financial",
    "economico": "financial",
    "económica": "financial",
    "rrhh": "hr",
    "recursos_humanos": "hr",
    "personal": "hr",
    "humanos": "hr",
    "logistica": "logistics",
    "logistico": "logistics",
    "ambiental": "environmental",
    "medioambiental": "environmental",
    "medio_ambiente": "environmental",
    "calidad": "quality",
    "seguridad": "safety",
    "seguridad_e_higiene": "safety",
    "otro": "other",
    "otros": "other",
}
DOMAIN_ALLOWED = {
    "technical",
    "administrative",
    "legal",
    "financial",
    "hr",
    "logistics",
    "environmental",
    "quality",
    "safety",
    "other",
}
VERIFICATION_ALIASES: Dict[str, str] = {
    "documento_adjunto": "attached_document",
    "adjunto": "attached_document",
    "documento": "attached_document",
    "declaracion_jurada": "sworn_statement",
    "declaracion": "sworn_statement",
    "jurada": "sworn_statement",
    "certificado_externo": "external_certificate",
    "certificado": "external_certificate",
    "inspeccion": "inspection",
    "muestra": "sample",
    "muestreo": "sample",
    "visita_sitio": "site_visit",
    "visita": "site_visit",
    "site": "site_visit",
    "auto_verificable": "auto_verifiable_from_offer",
    "autoverificable": "auto_verifiable_from_offer",
    "oferta": "auto_verifiable_from_offer",
    "otro": "other",
    "otros": "other",
}
VERIFICATION_ALLOWED = {
    "attached_document",
    "sworn_statement",
    "external_certificate",
    "inspection",
    "sample",
    "site_visit",
    "auto_verifiable_from_offer",
    "other",
}
TEMPORAL_ALIASES: Dict[str, str] = {
    "al_presentar": "at_bid_time",
    "en_oferta": "at_bid_time",
    "al_ofertar": "at_bid_time",
    "oferta": "at_bid_time",
    "pre_adjudicacion": "pre_award",
    "previa_adjudicacion": "pre_award",
    "antes_adjudicacion": "pre_award",
    "durante_ejecucion": "during_execution",
    "ejecucion": "during_execution",
    "post_venta": "post_sale",
    "posventa": "post_sale",
    "postventa": "post_sale",
    "otro": "other",
    "otros": "other",
}
TEMPORAL_ALLOWED = {
    "at_bid_time",
    "pre_award",
    "during_execution",
    "post_sale",
    "other",
}
CONFIDENCE_ALIASES: Dict[str, str] = {
    "high": "alta",
    "alta_confianza": "alta",
    "medium": "media",
    "med": "media",
    "low": "baja",
    "very_low": "muy_baja",
    "muy_low": "muy_baja",
}
CONFIDENCE_ALLOWED = {"alta", "media", "baja", "muy_baja"}

_normalize_role = _make_normalizer(ROLE_ALIASES, ROLE_ALLOWED)
_normalize_domain = _make_normalizer(DOMAIN_ALIASES, DOMAIN_ALLOWED)
_normalize_verification = _make_normalizer(VERIFICATION_ALIASES, VERIFICATION_ALLOWED)
_normalize_temporal = _make_normalizer(TEMPORAL_ALIASES, TEMPORAL_ALLOWED)
_normalize_confidence = _make_normalizer(CONFIDENCE_ALIASES, CONFIDENCE_ALLOWED)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
CONFIDENCE_ORDER = {"alta": 3, "media": 2, "baja": 1, "muy_baja": 0}


class RequirementCitation(BaseModel):
    chunk_id: str
    page_number: Optional[int] = None
    filename: Optional[str] = None
    snippet: str


def _drop_uncited_requirements(data):
    """Drop requirements the model returned without citations.

    gpt-4.1-mini occasionally emits a requirement with empty `citations`. Such a
    requirement is ungrounded and could never pass `min_length=1` downstream, so
    dropping just that item lets the rest of the batch validate instead of failing
    the whole batch and falling back to Gemini.
    """
    if isinstance(data, dict):
        reqs = data.get("requirements")
        if isinstance(reqs, list):
            data = {
                **data,
                "requirements": [
                    r for r in reqs if not isinstance(r, dict) or r.get("citations")
                ],
            }
    return data


class AdmissibilityRawRequirement(BaseModel):
    requirement_text: str
    requirement_summary: Optional[str] = None
    roles: Annotated[List[AdmissibilityRole], Field(min_length=1)]
    domain: RequirementDomain = "other"
    verification_method: RequirementVerificationMethod = "auto_verifiable_from_offer"
    temporal_scope: RequirementTemporalScope = "at_bid_time"
    citations: Annotated[List[RequirementCitation], Field(min_length=1)]
    confidence: Literal["alta", "media", "baja", "muy_baja"] = "media"
    notes: Optional[str] = None
    extraction_batch_id: int = 0

    @field_validator("roles", mode="before")
    @classmethod
    def _norm_roles(cls, v):
        if isinstance(v, list):
            return [_normalize_role(x) for x in v]
        return v

    @field_validator("domain", mode="before")
    @classmethod
    def _norm_domain(cls, v):
        return _normalize_domain(v)

    @field_validator("verification_method", mode="before")
    @classmethod
    def _norm_verification(cls, v):
        return _normalize_verification(v)

    @field_validator("temporal_scope", mode="before")
    @classmethod
    def _norm_temporal(cls, v):
        return _normalize_temporal(v)

    @field_validator("confidence", mode="before")
    @classmethod
    def _norm_confidence(cls, v):
        return _normalize_confidence(v)


class AdmissibilityBatchResponse(BaseModel):
    requirements: List[AdmissibilityRawRequirement]

    @model_validator(mode="before")
    @classmethod
    def _filter_uncited(cls, data):
        return _drop_uncited_requirements(data)


class FinalAdmissibilityRequirement(AdmissibilityRawRequirement):
    requirement_code: str


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
ADMISSIBILITY_SYSTEM_PROMPT = None  # loaded at runtime in main() via load_prompt

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(
    method: str,
    path: str,
    json_data: dict | list | None = None,
    params: dict | None = None,
) -> dict | list | None:
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(
        method, url, json=json_data, params=params, headers=API_HEADERS, timeout=60
    )
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def resolve_model_config():
    """Resolve the models this analysis runs on and the reasoning each one must
    be called with, and log it. Raises if the API does not answer or answers
    incomplete: a job that reasons at a level nobody configured returns a result
    that looks valid and costs whatever it wants, and nobody would notice."""
    global PRIMARY_PROVIDER, PRIMARY_MODEL, FALLBACK_PROVIDER, FALLBACK_MODEL

    cfg = api_request("GET", f"{API_ANALYSES_PATH}/{ANALYSIS_ID}/model-config") or {}
    selections = {}
    for role in ("primary", "secondary"):
        sel = cfg.get(role) or {}
        missing = [k for k in ("provider", "model_id", "reasoning") if not sel.get(k)]
        if missing:
            raise RuntimeError(
                f"model-config no devolvio el modelo {role} completo "
                f"(falta: {', '.join(missing)})"
            )
        selections[role] = sel
        REASONING[sel["provider"]] = sel["reasoning"]

    PRIMARY_PROVIDER = selections["primary"]["provider"]
    PRIMARY_MODEL = selections["primary"]["model_id"]
    FALLBACK_PROVIDER = selections["secondary"]["provider"]
    FALLBACK_MODEL = selections["secondary"]["model_id"]

    log_event(
        ANALYSIS_ID,
        "info",
        f"Modelo LLM: {PRIMARY_MODEL} (proveedor {PRIMARY_PROVIDER}, razonamiento "
        f"{REASONING[PRIMARY_PROVIDER]}); fallback {FALLBACK_MODEL} (proveedor "
        f"{FALLBACK_PROVIDER}, razonamiento {REASONING[FALLBACK_PROVIDER]}).",
        EVENT_SOURCE,
    )


def validate_env():
    missing = [
        var
        for var, val in [
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROCESSED_FILES_PATH", API_PROCESSED_FILES_PATH),
            (
                "API_ADMISSIBILITY_REQUIREMENTS_PATH",
                API_ADMISSIBILITY_REQUIREMENTS_PATH,
            ),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def notify_success():
    try:
        api_request(
            "POST",
            API_JOBS_CALLBACK,
            {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "success",
            },
        )
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def notify_failure(error_msg: str):
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request(
            "PATCH",
            f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status",
            {"status": "ready", "is_success": False},
        )
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request(
            "POST",
            API_JOBS_CALLBACK,
            {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "failed",
                "error_message": error_msg,
            },
        )
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


# ---------------------------------------------------------------------------
# Qdrant
# ---------------------------------------------------------------------------
def scroll_all_chunks(qdrant: QdrantClient, slug: str, analysis_id: str) -> List[dict]:
    """Aggregate all tender chunks across per-file collections FILE_{slug}_{file_id}.

    Order: alphabetical by filename, then by chunk_index within each file.
    """
    logger.info(f"Listing tender files for analysis_id={analysis_id}...")
    tender_files = api_request(
        "POST",
        f"{API_PROCESSED_FILES_PATH}search",
        {"analysis_id": analysis_id, "category": "tender"},
    )
    if not isinstance(tender_files, list):
        raise RuntimeError(
            f"Unexpected response from processed-files search: {type(tender_files)}"
        )

    tender_files.sort(key=lambda f: f.get("file_name") or "")
    logger.info(f"Found {len(tender_files)} tender files.")

    chunks: List[dict] = []
    for file_order, f in enumerate(tender_files):
        file_id = f["id"]
        file_name = f.get("file_name") or ""
        collection_name = f"FILE_{slug}_{file_id}"

        if not qdrant.collection_exists(collection_name):
            logger.warning(
                f"Collection '{collection_name}' missing; skipping file '{file_name}'."
            )
            continue

        offset = None
        file_chunk_count = 0
        while True:
            points, next_offset = qdrant.scroll(
                collection_name=collection_name,
                limit=SCROLL_PAGE_SIZE,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for point in points:
                payload = point.payload or {}
                if "chunk_index" not in payload:
                    raise RuntimeError(
                        f"Point {point.id} in collection '{collection_name}' has no 'chunk_index' field."
                    )
                chunks.append(
                    {
                        "chunk_id": str(point.id),
                        "file_order": file_order,
                        "chunk_index": int(payload["chunk_index"]),
                        "text": payload.get("text", ""),
                        "page_number": payload.get("page_number"),
                        "filename": payload.get("filename") or file_name,
                        "file_id": file_id,
                    }
                )
                file_chunk_count += 1
            offset = next_offset
            if offset is None:
                break
        logger.info(
            f"  '{file_name}': {file_chunk_count} chunks from '{collection_name}'."
        )

    chunks.sort(key=lambda c: (c["file_order"], c["chunk_index"]))
    logger.info(
        f"Fetched {len(chunks)} total tender chunks across {len(tender_files)} files."
    )
    return chunks


# ---------------------------------------------------------------------------
# Batching
# ---------------------------------------------------------------------------
def make_batches(chunks: List[dict], size: int, overlap: int) -> List[List[dict]]:
    if not chunks:
        return []
    step = size - overlap
    batches = []
    start = 0
    while start < len(chunks):
        batches.append(chunks[start : start + size])
        start += step
    return batches


# ---------------------------------------------------------------------------
# LLM extraction
# ---------------------------------------------------------------------------
def build_admissibility_user_prompt(batch: List[dict]) -> str:
    chunks_text = "\n\n".join(
        f"[chunk_id={c['chunk_id']} page_number={c['page_number'] or ''} filename={c.get('filename') or ''}]"
        f"\n{c['text']}"
        for c in batch
    )
    return (
        f"BATCH (chunks from the unified pliego document, ordered by position):\n"
        f"<chunks>\n{chunks_text}\n</chunks>\n\n"
        "Extract every admissibility requirement from these chunks following the rules above "
        "and respond with a single JSON object."
    )


def _is_provider_unavailable(err: Optional[Exception]) -> bool:
    if err is None:
        return False
    status = getattr(err, "status_code", None) or getattr(err, "code", None)
    return isinstance(status, int) and status in PROVIDER_UNAVAILABLE_STATUS_CODES


def _is_malformed_response(err: Optional[Exception]) -> bool:
    return isinstance(err, (ValidationError, json.JSONDecodeError))


def _count_raw_requirements(raw: str) -> Optional[int]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    reqs = data.get("requirements") if isinstance(data, dict) else None
    return len(reqs) if isinstance(reqs, list) else None


def _log_dropped_uncited(batch_id, label, provider, raw, result) -> None:
    raw_count = _count_raw_requirements(raw)
    if raw_count is None:
        return
    dropped = raw_count - len(result.requirements)
    if dropped <= 0:
        return
    logger.warning(
        f"Batch {batch_id}[{label}]: dropped {dropped} requirement(s) with empty "
        f"citations from {provider} ({raw_count} -> {len(result.requirements)})."
    )
    log_event(
        ANALYSIS_ID,
        "warning",
        f"Batch {batch_id}[{label}]: dropped {dropped} uncited requirement(s) ({provider}).",
        EVENT_SOURCE,
        {
            "batch_id": batch_id,
            "pass": label,
            "provider": provider,
            "dropped_uncited": dropped,
            "raw_count": raw_count,
            "kept_count": len(result.requirements),
        },
    )


@dataclass
class BatchOutcome:
    requirements: List["AdmissibilityRawRequirement"] = field(default_factory=list)
    duration_seconds: float = 0.0
    primary_used: bool = False
    primary_unavailable: bool = False
    fallback_used: bool = False
    fallback_failed: bool = False
    failure_reason: Optional[str] = None


def _call_with_retry(
    label: str,
    batch_id: int,
    fn: Callable[[], AdmissibilityBatchResponse],
) -> Tuple[Optional[AdmissibilityBatchResponse], Optional[Exception]]:
    last_err: Optional[Exception] = None
    unavailable_attempts = 0
    for attempt in range(1, MAX_LLM_RETRIES + 1):
        try:
            return fn(), None
        except Exception as err:
            last_err = err
            if _is_malformed_response(err):
                logger.warning(
                    f"Batch {batch_id}: {label} returned malformed JSON on attempt "
                    f"{attempt} ({type(err).__name__}). Aborting retries for this provider."
                )
                return None, err
            if _is_provider_unavailable(err):
                unavailable_attempts += 1
                if unavailable_attempts >= UNAVAILABLE_MAX_ATTEMPTS:
                    logger.warning(
                        f"Batch {batch_id}: {label} unavailable after {unavailable_attempts} "
                        f"attempts ({type(err).__name__}: {err}). Falling back."
                    )
                    return None, err
                delay = UNAVAILABLE_RETRY_DELAY + random.uniform(0, 1.0)
                logger.warning(
                    f"Batch {batch_id}: {label} unavailable on attempt {attempt} "
                    f"({type(err).__name__}: {err}). Retrying in {delay:.1f}s..."
                )
                time.sleep(delay)
                continue
            if attempt < MAX_LLM_RETRIES:
                delay = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(
                    0, 0.5
                )
                logger.warning(
                    f"Batch {batch_id}: {label} attempt {attempt}/{MAX_LLM_RETRIES} failed "
                    f"({type(err).__name__}: {err}). Retrying in {delay:.1f}s..."
                )
                time.sleep(delay)
    logger.error(
        f"Batch {batch_id}: {label} exhausted {MAX_LLM_RETRIES} attempts "
        f"({type(last_err).__name__}: {last_err})."
    )
    return None, last_err


def _run_llm_pass(
    gemini_client: genai.Client,
    openai_client: OpenAI,
    system_prompt: str,
    user_prompt: str,
    response_model,
    batch_id: int,
    label: str,
) -> Tuple[Optional[Any], Optional[Exception], bool, bool, bool]:
    """Run a single LLM pass with OpenAI->Gemini fallback.

    Returns (result, final_err, primary_unavailable, fallback_used, fallback_failed).
    """
    raw_capture = {"openai": "", "gemini": ""}
    attempts = {"openai": 0, "gemini": 0}

    def _record_usage(
        provider: str, model: str, units, attempt: int, success: bool
    ) -> None:
        in_u, out_u, cached = units
        record_usage(
            ANALYSIS_ID,
            SERVICE_NAME,
            provider,
            model,
            "chat",
            input_units=in_u,
            output_units=out_u,
            cached_input_units=cached,
            pricing=PRICING,
            attempt=attempt,
            success=success,
        )

    def _call_openai(model: str):
        attempts["openai"] += 1
        oai_response = openai_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            reasoning_effort=REASONING["openai"],
        )
        content = oai_response.choices[0].message.content or ""
        raw_capture["openai"] = content
        units = openai_units(oai_response)
        try:
            parsed = response_model.model_validate_json(content)
        except Exception:
            _record_usage("openai", model, units, attempts["openai"], False)
            raise
        _record_usage("openai", model, units, attempts["openai"], True)
        return parsed

    def _call_gemini(model: str):
        attempts["gemini"] += 1
        response = gemini_client.models.generate_content(
            model=model,
            contents=[
                genai_types.Content(
                    role="user", parts=[genai_types.Part(text=system_prompt)]
                ),
                genai_types.Content(
                    role="model",
                    parts=[
                        genai_types.Part(
                            text="Understood. I will return only a JSON object with the requirements list."
                        )
                    ],
                ),
                genai_types.Content(
                    role="user", parts=[genai_types.Part(text=user_prompt)]
                ),
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_model,
                thinking_config=genai_types.ThinkingConfig(thinking_level=REASONING["gemini"]),
            ),
        )
        raw_capture["gemini"] = response.text or ""
        units = gemini_units(response)
        try:
            parsed = response_model.model_validate_json(response.text)
        except Exception:
            _record_usage("gemini", model, units, attempts["gemini"], False)
            raise
        _record_usage("gemini", model, units, attempts["gemini"], True)
        return parsed

    def _make_call(provider: str, model: str):
        if provider == "gemini":
            return lambda: _call_gemini(model)
        return lambda: _call_openai(model)

    primary_unavailable = False
    fallback_used = False
    fallback_failed = False

    source: Optional[str] = None
    result, primary_err = _call_with_retry(
        f"{PRIMARY_PROVIDER}[{label}]",
        batch_id,
        _make_call(PRIMARY_PROVIDER, PRIMARY_MODEL),
    )
    if result is not None:
        source = PRIMARY_PROVIDER
    final_err: Optional[Exception] = None
    if result is None:
        if _is_provider_unavailable(primary_err):
            primary_unavailable = True
        logger.warning(
            f"Batch {batch_id}[{label}]: primary {PRIMARY_PROVIDER}/{PRIMARY_MODEL} failed "
            f"({type(primary_err).__name__}), falling back to {FALLBACK_PROVIDER}/{FALLBACK_MODEL}."
        )
        fallback_used = True
        result, fallback_err = _call_with_retry(
            f"{FALLBACK_PROVIDER}[{label}]",
            batch_id,
            _make_call(FALLBACK_PROVIDER, FALLBACK_MODEL),
        )
        if result is not None:
            source = FALLBACK_PROVIDER
        if result is None:
            fallback_failed = True
            final_err = fallback_err or primary_err
            raw_snippet = (
                raw_capture.get(FALLBACK_PROVIDER, "")
                or raw_capture.get(PRIMARY_PROVIDER, "")
            )[:1000]
            log_event(
                ANALYSIS_ID,
                "warning",
                f"Batch {batch_id}[{label}] failed after retries on {PRIMARY_PROVIDER} and {FALLBACK_PROVIDER}: "
                f"{type(final_err).__name__}: {str(final_err)[:300]}",
                EVENT_SOURCE,
                {
                    "batch_id": batch_id,
                    "pass": label,
                    "primary_error": f"{type(primary_err).__name__}: {str(primary_err)[:200]}"
                    if primary_err
                    else None,
                    "fallback_error": f"{type(fallback_err).__name__}: {str(fallback_err)[:200]}"
                    if fallback_err
                    else None,
                    "raw_response_snippet": raw_snippet,
                },
            )

    if result is not None and source is not None:
        _log_dropped_uncited(
            batch_id, label, source, raw_capture.get(source, ""), result
        )

    return result, final_err, primary_unavailable, fallback_used, fallback_failed


def extract_batch(
    gemini_client: genai.Client,
    openai_client: OpenAI,
    batch: List[dict],
    batch_id: int,
) -> BatchOutcome:
    outcome = BatchOutcome(primary_used=True)
    start = time.time()

    user_prompt = build_admissibility_user_prompt(batch)
    result, err, primary_unavail, fb_used, fb_failed = _run_llm_pass(
        gemini_client,
        openai_client,
        ADMISSIBILITY_SYSTEM_PROMPT,
        user_prompt,
        AdmissibilityBatchResponse,
        batch_id,
        "admissibility",
    )
    outcome.primary_unavailable = primary_unavail
    outcome.fallback_used = fb_used
    outcome.fallback_failed = fb_failed

    if result is not None:
        for req in result.requirements:
            req.extraction_batch_id = batch_id
        outcome.requirements = result.requirements
        logger.info(
            f"Batch {batch_id}[admissibility]: extracted {len(result.requirements)} requirements."
        )
    else:
        outcome.failure_reason = (
            f"{type(err).__name__}: {str(err)[:200]}" if err else "unknown"
        )
        logger.warning(f"Batch {batch_id}[admissibility]: pass failed.")

    outcome.duration_seconds = time.time() - start
    return outcome


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------
def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    return " ".join(text.split())


def _confidence_rank(c: str) -> int:
    return CONFIDENCE_ORDER.get(c, 0)


def _best_by_confidence(items: List[AdmissibilityRawRequirement], attr: str):
    best = max(items, key=lambda r: _confidence_rank(r.confidence))
    return getattr(best, attr)


def deduplicate_admissibility(
    raw_reqs: List[AdmissibilityRawRequirement],
) -> List[AdmissibilityRawRequirement]:
    groups: Dict[str, List[AdmissibilityRawRequirement]] = {}
    for req in raw_reqs:
        key = hashlib.sha1(normalize_text(req.requirement_text).encode()).hexdigest()
        groups.setdefault(key, []).append(req)

    merged = []
    for group in groups.values():
        if len(group) == 1:
            merged.append(group[0])
            continue

        req_text = max((r.requirement_text for r in group), key=len)
        req_summary = next(
            (r.requirement_summary for r in group if r.requirement_summary), None
        )

        seen_roles: Dict[str, None] = {}
        for r in group:
            for role in r.roles:
                seen_roles[role] = None
        roles = list(seen_roles)

        seen_cids: Dict[str, RequirementCitation] = {}
        for r in group:
            for c in r.citations:
                if c.chunk_id not in seen_cids:
                    seen_cids[c.chunk_id] = c
        citations = list(seen_cids.values())

        domain = _best_by_confidence(group, "domain")
        verification_method = _best_by_confidence(group, "verification_method")
        temporal_scope = _best_by_confidence(group, "temporal_scope")
        confidence = max((r.confidence for r in group), key=_confidence_rank)
        all_notes = [r.notes for r in group if r.notes]
        notes = " | ".join(dict.fromkeys(all_notes)) if all_notes else None
        extraction_batch_id = group[0].extraction_batch_id

        merged.append(
            AdmissibilityRawRequirement(
                requirement_text=req_text,
                requirement_summary=req_summary,
                roles=roles,
                domain=domain,
                verification_method=verification_method,
                temporal_scope=temporal_scope,
                citations=citations,
                confidence=confidence,
                notes=notes,
                extraction_batch_id=extraction_batch_id,
            )
        )

    return merged


# ---------------------------------------------------------------------------
# Code assignment
# ---------------------------------------------------------------------------
def assign_codes_admissibility(
    reqs: List[AdmissibilityRawRequirement], chunk_index_map: Dict[str, int]
) -> List[FinalAdmissibilityRequirement]:
    def first_position(req: AdmissibilityRawRequirement) -> int:
        positions = [chunk_index_map.get(c.chunk_id, 999999) for c in req.citations]
        return min(positions) if positions else 999999

    sorted_reqs = sorted(reqs, key=first_position)
    return [
        FinalAdmissibilityRequirement(
            **req.model_dump(), requirement_code=f"ADM-{i:03d}"
        )
        for i, req in enumerate(sorted_reqs, start=1)
    ]


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------
def post_admissibility_bulk(
    analysis_id: str, reqs: List[FinalAdmissibilityRequirement]
):
    payload = [r.model_dump() for r in reqs]
    api_request(
        "POST",
        f"{API_ADMISSIBILITY_REQUIREMENTS_PATH}bulk",
        payload,
        params={"analysis_id": analysis_id},
    )
    logger.info(f"POST admissibility bulk: {len(reqs)} requirements saved.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_extraction():
    logger.info(f"Starting admissibility-extractor for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    log_event(
        ANALYSIS_ID,
        "info",
        "Iniciando extracción de requisitos de admisibilidad...",
        EVENT_SOURCE,
    )

    # 1. Get analysis slug
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Target Qdrant collection prefix: FILE_{slug}_*")

    # 2. Scroll all tender chunks
    chunks = scroll_all_chunks(qdrant, slug, ANALYSIS_ID)
    if not chunks:
        msg = "No tender chunks found for this analysis in Qdrant."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        notify_success()
        return

    chunk_index_map = {c["chunk_id"]: c["chunk_index"] for c in chunks}
    chunk_info_map = {c["chunk_id"]: c for c in chunks}

    # 3. Build batches
    batches = make_batches(chunks, BATCH_SIZE, BATCH_OVERLAP)
    logger.info(
        f"Processing {len(chunks)} chunks in {len(batches)} batches "
        f"(size={BATCH_SIZE}, overlap={BATCH_OVERLAP})."
    )
    log_event(
        ANALYSIS_ID,
        "info",
        f"Procesando {len(chunks)} chunks en {len(batches)} batches...",
        EVENT_SOURCE,
    )

    # 4. Parallel batch extraction
    raw_results: List[AdmissibilityRawRequirement] = []
    failed_batches = 0
    outcomes: Dict[int, BatchOutcome] = {}

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_BATCHES) as executor:
        futures = {
            executor.submit(
                extract_batch, gemini_client, openai_client, batch, batch_id
            ): batch_id
            for batch_id, batch in enumerate(batches, start=1)
        }
        for future in as_completed(futures):
            batch_id = futures[future]
            try:
                outcome = future.result()
                outcomes[batch_id] = outcome
                # A batch with 0 requirements is a valid outcome (most chunks
                # carry no admissibility content); failed = failure_reason set.
                if outcome.failure_reason:
                    failed_batches += 1
                else:
                    raw_results.extend(outcome.requirements)
            except Exception as e:
                msg = f"Batch {batch_id} raised unexpected exception: {type(e).__name__}: {e}"
                logger.error(msg)
                log_event(ANALYSIS_ID, "warning", msg[:500], EVENT_SOURCE)
                outcomes[batch_id] = BatchOutcome(failure_reason=msg[:200])
                failed_batches += 1

    logger.info(
        f"Extraction complete: {len(raw_results)} raw admissibility requirements, "
        f"{failed_batches}/{len(batches)} batches failed."
    )

    if (
        failed_batches > 0
        and (failed_batches / max(len(batches), 1)) > MAX_FAILED_BATCH_RATIO
    ):
        raise RuntimeError(
            f"Failed batches: {failed_batches}/{len(batches)} "
            f"(threshold {int(MAX_FAILED_BATCH_RATIO * 100)}%). "
            "Aborting to avoid incomplete results."
        )

    # 5. Deduplicate -> assign codes -> enrich citations
    deduped = deduplicate_admissibility(raw_results)
    logger.info(
        f"After deduplication: {len(deduped)} requirements (from {len(raw_results)} raw)."
    )

    with_codes = assign_codes_admissibility(deduped, chunk_index_map)

    for req in with_codes:
        for cit in req.citations:
            info = chunk_info_map.get(cit.chunk_id)
            if info:
                cit.filename = info.get("filename")
                if cit.page_number is None:
                    cit.page_number = info.get("page_number")

    # 6. Persist
    if with_codes:
        post_admissibility_bulk(ANALYSIS_ID, with_codes)
    else:
        logger.warning("No admissibility requirements to persist.")

    # 7. Summary + notify success
    domain_counts: Dict[str, int] = {}
    role_counts: Dict[str, int] = {}
    for r in with_codes:
        domain_counts[r.domain] = domain_counts.get(r.domain, 0) + 1
        for role in r.roles:
            role_counts[role] = role_counts.get(role, 0) + 1

    primary_unavailable_count = sum(
        1 for o in outcomes.values() if o.primary_unavailable
    )
    fallbacks_succeeded = sum(
        1 for o in outcomes.values() if o.fallback_used and not o.fallback_failed
    )
    fallbacks_failed = sum(1 for o in outcomes.values() if o.fallback_failed)
    failed_batch_ids = sorted(bid for bid, o in outcomes.items() if o.failure_reason)
    durations = sorted(
        ((bid, o.duration_seconds) for bid, o in outcomes.items()), key=lambda x: -x[1]
    )
    slowest_batch_id, slowest_batch_seconds = durations[0] if durations else (None, 0.0)

    summary = (
        f"Extracción completada: {len(with_codes)} requisitos de admisibilidad | "
        f"batches fallidos: {failed_batches}/{len(batches)}"
    )
    logger.info(summary)
    log_event(
        ANALYSIS_ID,
        "info",
        summary,
        EVENT_SOURCE,
        {
            "admissibility_requirement_count": len(with_codes),
            "raw_admissibility_count": len(raw_results),
            "batch_count": len(batches),
            "failed_batches": failed_batches,
            "failed_batch_ids": failed_batch_ids,
            "primary_unavailable_batches": primary_unavailable_count,
            "fallbacks_succeeded": fallbacks_succeeded,
            "fallbacks_failed": fallbacks_failed,
            "slowest_batch_id": slowest_batch_id,
            "slowest_batch_seconds": round(slowest_batch_seconds, 2),
            "domain_distribution": domain_counts,
            "role_distribution": role_counts,
        },
    )

    notify_success()


def main():
    global PRICING, ADMISSIBILITY_SYSTEM_PROMPT
    validate_env()
    ADMISSIBILITY_SYSTEM_PROMPT = load_prompt(
        "service-admissibility-extractor/admissibility_extractor"
    )
    PRICING = load_pricing()
    try:
        resolve_model_config()
        process_extraction()
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
