"""
Requirement Extractor Service
==============================
Extracts atomic requirements from a unified tender document already indexed in
Qdrant, classifies each requirement on 7 axes (roles, mapped_factors, domain,
weight, verification_method, temporal_scope, citations), deduplicates across
batches, validates against the evaluation_profile produced by
service-tender-classifier, and persists the result via the backend API.

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
  - API_TENDER_CLASSIFICATIONS_PATH
  - API_ANALYSIS_REQUIREMENTS_PATH
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
from pathlib import Path
from typing import Annotated, Any, Callable, Dict, List, Literal, Optional, Tuple, Union

import requests
from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage
from prompt_loader import load_prompt
from google import genai
from google.genai import types as genai_types
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from qdrant_client import QdrantClient
from qdrant_client.http import models
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
API_TENDER_CLASSIFICATIONS_PATH = os.environ.get("API_TENDER_CLASSIFICATIONS_PATH")
API_ANALYSIS_REQUIREMENTS_PATH = os.environ.get("API_ANALYSIS_REQUIREMENTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-requirement-extractor"
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
RequirementRole = Literal[
    "admisibilidad_obligatoria",
    "admisibilidad_subsanable",
    "puntuable",
    "penalizador",
    "informativo",
    "preferencia_legal",
    "desconocido_pendiente_pliego_general",
]

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
    "puntua": "puntuable",
    "puntuado": "puntuable",
    "penaliza": "penalizador",
    "informacion": "informativo",
    "informativa": "informativo",
    "preferencia": "preferencia_legal",
    "pliego_general": "desconocido_pendiente_pliego_general",
    "desconocido": "desconocido_pendiente_pliego_general",
}
ROLE_ALLOWED = {
    "admisibilidad_obligatoria",
    "admisibilidad_subsanable",
    "puntuable",
    "penalizador",
    "informativo",
    "preferencia_legal",
    "desconocido_pendiente_pliego_general",
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
WEIGHT_TYPE_ALIASES: Dict[str, str] = {
    "puntos": "points",
    "puntaje": "points",
    "puntajes": "points",
    "porcentaje": "percent",
    "porcentajes": "percent",
    "porciento": "percent",
    "percentual": "percent",
    "formula": "formula",
    "fórmula": "formula",
    "ninguno": "none",
    "sin": "none",
    "n_a": "none",
    "na": "none",
}
WEIGHT_TYPE_ALLOWED = {"points", "percent", "formula", "none"}
BLOCK_ALIASES: Dict[str, str] = {
    "cualitativo": "cualitativo",
    "calidad": "cualitativo",
    "cuantitativo": "cuantitativo",
    "cantidad": "cuantitativo",
}
BLOCK_ALLOWED = {"cualitativo", "cuantitativo"}

_normalize_role = _make_normalizer(ROLE_ALIASES, ROLE_ALLOWED)
_normalize_domain = _make_normalizer(DOMAIN_ALIASES, DOMAIN_ALLOWED)
_normalize_verification = _make_normalizer(VERIFICATION_ALIASES, VERIFICATION_ALLOWED)
_normalize_temporal = _make_normalizer(TEMPORAL_ALIASES, TEMPORAL_ALLOWED)
_normalize_confidence = _make_normalizer(CONFIDENCE_ALIASES, CONFIDENCE_ALLOWED)
_normalize_weight_type = _make_normalizer(WEIGHT_TYPE_ALIASES, WEIGHT_TYPE_ALLOWED)
_normalize_block = _make_normalizer(BLOCK_ALIASES, BLOCK_ALLOWED)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
CONFIDENCE_ORDER = {"alta": 3, "media": 2, "baja": 1, "muy_baja": 0}


class MappedFactor(BaseModel):
    factor_id: str
    weight_type: Literal["points", "percent", "formula", "none"]
    weight_value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None

    @field_validator("weight_type", mode="before")
    @classmethod
    def _norm_weight_type(cls, v):
        return _normalize_weight_type(v)

    @field_validator("block", mode="before")
    @classmethod
    def _norm_block(cls, v):
        return _normalize_block(v) if v is not None else v


class RequirementWeight(BaseModel):
    type: Literal["points", "percent", "formula", "none"] = "none"
    value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None

    @field_validator("type", mode="before")
    @classmethod
    def _norm_type(cls, v):
        return _normalize_weight_type(v)

    @field_validator("block", mode="before")
    @classmethod
    def _norm_block(cls, v):
        return _normalize_block(v) if v is not None else v


class RequirementCitation(BaseModel):
    chunk_id: str
    page_number: Optional[int] = None
    filename: Optional[str] = None
    snippet: str


class RawRequirement(BaseModel):
    requirement_text: str
    requirement_summary: Optional[str] = None
    roles: Annotated[List[RequirementRole], Field(min_length=1)]
    mapped_factors: List[MappedFactor] = Field(default_factory=list)
    domain: RequirementDomain = "other"
    weight: RequirementWeight = Field(default_factory=RequirementWeight)
    verification_method: RequirementVerificationMethod = "other"
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


class BatchResponse(BaseModel):
    requirements: List[RawRequirement]

    @model_validator(mode="before")
    @classmethod
    def _filter_uncited(cls, data):
        return _drop_uncited_requirements(data)


class FinalRequirement(RawRequirement):
    requirement_code: str


# ---------------------------------------------------------------------------
# System Prompts
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = None  # loaded at runtime in main() via load_prompt

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
            ("API_TENDER_CLASSIFICATIONS_PATH", API_TENDER_CLASSIFICATIONS_PATH),
            ("API_ANALYSIS_REQUIREMENTS_PATH", API_ANALYSIS_REQUIREMENTS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


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
# Profile
# ---------------------------------------------------------------------------
def get_evaluation_profile(analysis_id: str) -> dict:
    profile = api_request("GET", f"{API_TENDER_CLASSIFICATIONS_PATH}{analysis_id}")
    if not isinstance(profile, dict):
        raise RuntimeError(
            f"Unexpected response type from tender-classifications: {type(profile)}"
        )
    profile_version = profile.get("profile_version")
    if profile_version is not None and profile_version != 2:
        raise RuntimeError(
            f"evaluation_profile version mismatch: expected 2, got {profile_version}. "
            "Re-run service-tender-classifier for this analysis before extracting requirements."
        )
    if not profile.get("enabled_roles"):
        raise RuntimeError(
            "evaluation_profile has no enabled_roles. Cannot extract requirements without a valid profile."
        )
    logger.info(
        f"Loaded evaluation profile: system_type={profile.get('system_type')}, factors={len(profile.get('factors', []))}"
    )
    return profile


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
def build_user_prompt(profile: dict, batch: List[dict]) -> str:
    profile_json = json.dumps(profile, ensure_ascii=False, indent=2)
    chunks_text = "\n\n".join(
        f"[chunk_id={c['chunk_id']} page_number={c['page_number'] or ''} filename={c.get('filename') or ''}]"
        f"\n{c['text']}"
        for c in batch
    )
    return (
        f"EVALUATION PROFILE (already detected for this pliego):\n"
        f"<json>\n{profile_json}\n</json>\n\n"
        f"BATCH (chunks from the unified pliego document, ordered by position):\n"
        f"<chunks>\n{chunks_text}\n</chunks>\n\n"
        "Extract every atomic requirement from these chunks following the rules above "
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
    requirements: List["RawRequirement"] = field(default_factory=list)
    duration_seconds: float = 0.0
    primary_used: bool = False
    primary_unavailable: bool = False
    fallback_used: bool = False
    fallback_failed: bool = False
    failure_reason: Optional[str] = None


def _call_with_retry(
    label: str,
    batch_id: int,
    fn: Callable[[], BatchResponse],
) -> Tuple[Optional[BatchResponse], Optional[Exception]]:
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
    profile: dict,
    batch: List[dict],
    batch_id: int,
) -> BatchOutcome:
    outcome = BatchOutcome(primary_used=True)
    start = time.time()

    # General pass (with the evaluation profile)
    gen_user_prompt = build_user_prompt(profile, batch)
    gen_result, gen_err, gen_primary_unavail, gen_fb_used, gen_fb_failed = (
        _run_llm_pass(
            gemini_client,
            openai_client,
            SYSTEM_PROMPT,
            gen_user_prompt,
            BatchResponse,
            batch_id,
            "general",
        )
    )
    if gen_primary_unavail:
        outcome.primary_unavailable = True
    if gen_fb_used:
        outcome.fallback_used = True
    if gen_fb_failed:
        outcome.fallback_failed = True
    if gen_result is not None:
        for req in gen_result.requirements:
            req.extraction_batch_id = batch_id
        outcome.requirements = gen_result.requirements
        logger.info(
            f"Batch {batch_id}[general]: extracted {len(gen_result.requirements)} requirements."
        )
    else:
        outcome.failure_reason = (
            f"{type(gen_err).__name__}: {str(gen_err)[:200]}" if gen_err else "unknown"
        )

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


def _best_by_confidence(items: List[RawRequirement], attr: str):
    best = max(items, key=lambda r: _confidence_rank(r.confidence))
    return getattr(best, attr)


def deduplicate(raw_reqs: List[RawRequirement]) -> List[RawRequirement]:
    groups: Dict[str, List[RawRequirement]] = {}
    for req in raw_reqs:
        key = hashlib.sha1(normalize_text(req.requirement_text).encode()).hexdigest()
        groups.setdefault(key, []).append(req)

    merged = []
    for group in groups.values():
        if len(group) == 1:
            merged.append(group[0])
            continue

        # requirement_text: longest
        req_text = max((r.requirement_text for r in group), key=len)

        # requirement_summary: first non-None
        req_summary = next(
            (r.requirement_summary for r in group if r.requirement_summary), None
        )

        # roles: union, preserve first-seen order
        seen_roles: Dict[str, None] = {}
        for r in group:
            for role in r.roles:
                seen_roles[role] = None
        roles = list(seen_roles)

        # mapped_factors: union by factor_id; prefer higher confidence
        factors_by_id: Dict[str, Tuple[MappedFactor, int]] = {}
        for r in group:
            rank = _confidence_rank(r.confidence)
            for mf in r.mapped_factors:
                existing = factors_by_id.get(mf.factor_id)
                if existing is None or rank > existing[1]:
                    factors_by_id[mf.factor_id] = (mf, rank)
        mapped_factors = [mf for mf, _ in factors_by_id.values()]

        # citations: union deduped by chunk_id
        seen_cids: Dict[str, RequirementCitation] = {}
        for r in group:
            for c in r.citations:
                if c.chunk_id not in seen_cids:
                    seen_cids[c.chunk_id] = c
        citations = list(seen_cids.values())

        # single-value fields: highest-confidence item wins
        domain = _best_by_confidence(group, "domain")
        verification_method = _best_by_confidence(group, "verification_method")
        temporal_scope = _best_by_confidence(group, "temporal_scope")
        weight = _best_by_confidence(group, "weight")

        # confidence: maximum of the group
        confidence = max((r.confidence for r in group), key=_confidence_rank)

        # notes: concatenate unique non-None
        all_notes = [r.notes for r in group if r.notes]
        unique_notes = list(dict.fromkeys(all_notes))
        notes = " | ".join(unique_notes) if unique_notes else None

        extraction_batch_id = group[0].extraction_batch_id

        merged.append(
            RawRequirement(
                requirement_text=req_text,
                requirement_summary=req_summary,
                roles=roles,
                mapped_factors=mapped_factors,
                domain=domain,
                weight=weight,
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
def assign_codes(
    reqs: List[RawRequirement], chunk_index_map: Dict[str, int]
) -> List[FinalRequirement]:
    def first_position(req: RawRequirement) -> int:
        positions = [chunk_index_map.get(c.chunk_id, 999999) for c in req.citations]
        return min(positions) if positions else 999999

    sorted_reqs = sorted(reqs, key=first_position)
    result = []
    for i, req in enumerate(sorted_reqs, start=1):
        result.append(
            FinalRequirement(
                **req.model_dump(),
                requirement_code=f"REQ-{i:03d}",
            )
        )
    return result


# ---------------------------------------------------------------------------
# Profile validation
# ---------------------------------------------------------------------------
def validate_against_profile(
    reqs: List[FinalRequirement],
    profile: dict,
) -> Tuple[List[FinalRequirement], List[str]]:
    enabled_roles = profile.get("enabled_roles", {})
    enabled_role_ids = {
        r for r, v in enabled_roles.items() if isinstance(v, dict) and v.get("enabled")
    }
    valid_factor_ids = {f["id"] for f in profile.get("factors", [])}
    system_type = profile.get("system_type", "")

    cleaned: List[FinalRequirement] = []
    warnings: List[str] = []

    for req in reqs:
        # --- Eje 1: strip disallowed roles ---
        valid_roles = [r for r in req.roles if r in enabled_role_ids]
        if not valid_roles:
            warnings.append(
                f"{req.requirement_code}: all roles {req.roles} are not enabled "
                f"in the profile (enabled: {sorted(enabled_role_ids)}). Requirement discarded."
            )
            continue

        # solo_precio_exclusivo: downgrade puntuable/penalizador
        if system_type == "solo_precio_exclusivo":
            replaced = []
            for r in valid_roles:
                if r in ("puntuable", "penalizador"):
                    warnings.append(
                        f"{req.requirement_code}: role '{r}' not allowed under "
                        f"solo_precio_exclusivo; downgraded to admisibilidad_obligatoria."
                    )
                    replaced.append("admisibilidad_obligatoria")
                else:
                    replaced.append(r)
            valid_roles = list(dict.fromkeys(replaced))

        # --- Eje 2: strip invalid mapped_factors ---
        valid_factors = [
            mf for mf in req.mapped_factors if mf.factor_id in valid_factor_ids
        ]
        invalid_fids = [
            mf.factor_id
            for mf in req.mapped_factors
            if mf.factor_id not in valid_factor_ids
        ]
        if invalid_fids:
            warnings.append(
                f"{req.requirement_code}: removed mapped_factors with unknown factor_ids: {invalid_fids}."
            )

        # If puntuable/penalizador but no valid mapped_factors after strip, degrade
        scoring_roles = {"puntuable", "penalizador"}
        has_scoring_role = any(r in scoring_roles for r in valid_roles)
        if has_scoring_role and not valid_factors:
            for sr in scoring_roles:
                if sr in valid_roles:
                    valid_roles = [r for r in valid_roles if r != sr]
                    warnings.append(
                        f"{req.requirement_code}: role '{sr}' downgraded to 'informativo' "
                        f"because mapped_factors is empty after validation."
                    )
                    if (
                        "informativo" not in valid_roles
                        and "informativo" in enabled_role_ids
                    ):
                        valid_roles.append("informativo")

        if not valid_roles:
            warnings.append(
                f"{req.requirement_code}: no valid roles remain after validation. Discarded."
            )
            continue

        cleaned.append(
            FinalRequirement(
                **{
                    **req.model_dump(),
                    "roles": valid_roles,
                    "mapped_factors": valid_factors,
                },
            )
        )

    # Strategy-level cross-requirement checks
    if system_type == "solo_precio_con_AN":
        has_an_penalizador = any(
            "penalizador" in r.roles
            and any(mf.factor_id == "antecedentes_negativos" for mf in r.mapped_factors)
            for r in cleaned
        )
        if not has_an_penalizador:
            warnings.append(
                "Strategy is solo_precio_con_AN but no requirement with role 'penalizador' "
                "mapped to 'antecedentes_negativos' was found. Check that the AN annex is indexed."
            )

    return cleaned, warnings


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------
def post_bulk(analysis_id: str, reqs: List[FinalRequirement]):
    payload = [r.model_dump() for r in reqs]
    api_request(
        "POST",
        f"{API_ANALYSIS_REQUIREMENTS_PATH}bulk",
        payload,
        params={"analysis_id": analysis_id},
    )
    logger.info(f"POST bulk: {len(reqs)} requirements saved.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_extraction():
    logger.info(f"Starting requirement-extractor for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    log_event(
        ANALYSIS_ID,
        "info",
        "Iniciando extracción de requisitos con clasificación multi-eje...",
        EVENT_SOURCE,
    )

    # 1. Get analysis slug
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Target Qdrant collection: {slug}")

    # 2. Load evaluation profile
    profile = get_evaluation_profile(ANALYSIS_ID)

    # 3. Scroll all tender chunks
    chunks = scroll_all_chunks(qdrant, slug, ANALYSIS_ID)
    if not chunks:
        msg = "No tender chunks found for this analysis in Qdrant."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        api_request(
            "POST",
            API_JOBS_CALLBACK,
            {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "success",
            },
        )
        return

    chunk_index_map = {c["chunk_id"]: c["chunk_index"] for c in chunks}
    chunk_info_map = {c["chunk_id"]: c for c in chunks}

    # 4. Build batches
    batches = make_batches(chunks, BATCH_SIZE, BATCH_OVERLAP)
    logger.info(
        f"Processing {len(chunks)} chunks in {len(batches)} batches (size={BATCH_SIZE}, overlap={BATCH_OVERLAP})."
    )
    log_event(
        ANALYSIS_ID,
        "info",
        f"Procesando {len(chunks)} chunks en {len(batches)} batches...",
        EVENT_SOURCE,
    )

    # 5. Parallel batch extraction
    raw_results: List[RawRequirement] = []
    failed_batches = 0
    outcomes: Dict[int, BatchOutcome] = {}

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_BATCHES) as executor:
        futures = {
            executor.submit(
                extract_batch, gemini_client, openai_client, profile, batch, batch_id
            ): batch_id
            for batch_id, batch in enumerate(batches, start=1)
        }
        for future in as_completed(futures):
            batch_id = futures[future]
            try:
                outcome = future.result()
                outcomes[batch_id] = outcome
                # A batch with 0 requirements is a valid outcome; failed means
                # the LLM pass errored (failure_reason set).
                if outcome.failure_reason:
                    failed_batches += 1
                else:
                    raw_results.extend(outcome.requirements)
            except Exception as e:
                msg = f"Batch {batch_id} raised unexpected exception: {type(e).__name__}: {e}"
                logger.error(msg)
                log_event(ANALYSIS_ID, "warning", msg[:500], EVENT_SOURCE)
                outcomes[batch_id] = BatchOutcome()
                outcomes[batch_id].failure_reason = msg[:200]
                failed_batches += 1

    logger.info(
        f"Extraction complete: {len(raw_results)} raw requirements, "
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

    if not raw_results:
        msg = "No requirements extracted from any batch."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        api_request(
            "POST",
            API_JOBS_CALLBACK,
            {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "success",
            },
        )
        return

    # 6. General bucket: deduplicate -> assign codes -> validate against profile
    deduped = deduplicate(raw_results)
    logger.info(
        f"After deduplication: {len(deduped)} requirements (from {len(raw_results)} raw)."
    )

    with_codes = assign_codes(deduped, chunk_index_map)

    cleaned, validation_warnings = validate_against_profile(with_codes, profile)
    for w in validation_warnings:
        logger.warning(f"profile_validation: {w}")
        log_event(ANALYSIS_ID, "warning", w, EVENT_SOURCE)
    logger.info(
        f"After validation: {len(cleaned)} requirements remain ({len(with_codes) - len(cleaned)} discarded)."
    )

    # Enrich citations with canonical filename + page_number from Qdrant
    for req in cleaned:
        for cit in req.citations:
            info = chunk_info_map.get(cit.chunk_id)
            if info:
                cit.filename = info.get("filename")
                if cit.page_number is None:
                    cit.page_number = info.get("page_number")

    # 7. Persist
    post_bulk(ANALYSIS_ID, cleaned)

    # 8. Summary + notify success
    domain_counts: Dict[str, int] = {}
    role_counts: Dict[str, int] = {}
    for r in cleaned:
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
    duration_values = sorted(o.duration_seconds for o in outcomes.values())
    p95_batch_seconds = (
        duration_values[int(len(duration_values) * 0.95) - 1]
        if duration_values
        else 0.0
    )

    summary = (
        f"Extracción completada: {len(cleaned)} requisitos generales | "
        f"batches fallidos: {failed_batches}/{len(batches)} | "
        f"warnings de validacion: {len(validation_warnings)}"
    )
    logger.info(summary)
    log_event(
        ANALYSIS_ID,
        "info",
        summary,
        EVENT_SOURCE,
        {
            "requirement_count": len(cleaned),
            "raw_count": len(raw_results),
            "batch_count": len(batches),
            "failed_batches": failed_batches,
            "failed_batch_ids": failed_batch_ids,
            "primary_unavailable_batches": primary_unavailable_count,
            "fallbacks_succeeded": fallbacks_succeeded,
            "fallbacks_failed": fallbacks_failed,
            "slowest_batch_id": slowest_batch_id,
            "slowest_batch_seconds": round(slowest_batch_seconds, 2),
            "p95_batch_seconds": round(p95_batch_seconds, 2),
            "validation_warnings": len(validation_warnings),
            "domain_distribution": domain_counts,
            "role_distribution": role_counts,
        },
    )

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


def main():
    global PRICING, SYSTEM_PROMPT
    validate_env()
    SYSTEM_PROMPT = load_prompt("service-requirement-extractor/requirements_extractor")
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
