"""
Tender Classifier Service
=========================
Classifies the bid evaluation/scoring system used in a Uruguayan public
procurement document (pliego de licitacion) AND produces the full
"evaluation profile" for downstream services:

  1) system_type   -> the evaluation strategy label (puntos, porcentajes, ...)
  2) factors       -> instantiated scoring factors with weights/formulas/cites
  3) role_signals  -> textual evidence for each Eje-1 role
  4) enabled_roles -> intersection of (strategy-allowed roles) and (text-detected roles)

The evaluation profile is the contract consumed by the next microservice
(requirements extraction) so that each requirement can be classified inside a
consistent multi-axis scheme.

Given an ANALYSIS_ID, retrieves relevant tender chunks from Qdrant via
semantic search (RAG), sends them to a classification LLM (Gemini primary,
OpenAI fallback), and stores the result via the backend API.

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
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
import unicodedata
from pathlib import Path
from typing import List, Optional, Literal, Dict, Tuple, Set

import requests
from openai import OpenAI
from google import genai
from google.genai import types as genai_types
from qdrant_client import QdrantClient
from qdrant_client.http import models
from pydantic import BaseModel, Field, field_validator

from supabase_logger import setup_logger, log_event, make_session
from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage

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
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-tender-classifier"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_THINKING_BUDGET = 4096
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


logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
VALID_SYSTEM_TYPES = [
    "puntos", "porcentajes", "mixto_cualitativo_cuantitativo",
    "solo_precio_con_AN", "solo_precio_exclusivo",
    "precio_con_incremento_multas", "delegado_pliego_general",
    "indeterminado",
]


# ---------------------------------------------------------------------------
# Literal alias normalizer (Spanish variants -> canonical)
# ---------------------------------------------------------------------------
def _strip_accents(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def _make_normalizer(aliases: Dict[str, str], allowed: Set[str]):
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


SYSTEM_TYPE_ALIASES: Dict[str, str] = {
    "puntaje": "puntos", "puntajes": "puntos", "por_puntos": "puntos",
    "porcentaje": "porcentajes", "por_porcentaje": "porcentajes",
    "mixto": "mixto_cualitativo_cuantitativo", "mixto_cuali_cuanti": "mixto_cualitativo_cuantitativo",
    "solo_precio": "solo_precio_exclusivo", "precio_exclusivo": "solo_precio_exclusivo",
    "precio": "solo_precio_exclusivo", "precio_unico": "solo_precio_exclusivo",
    "precio_con_an": "solo_precio_con_AN", "solo_precio_an": "solo_precio_con_AN",
    "precio_con_multas": "precio_con_incremento_multas", "incremento_multas": "precio_con_incremento_multas",
    "delegado": "delegado_pliego_general", "pliego_general": "delegado_pliego_general",
    "indeterminada": "indeterminado", "desconocido": "indeterminado", "n_a": "indeterminado", "na": "indeterminado",
}
SYSTEM_TYPE_ALLOWED = {
    "puntos", "porcentajes", "mixto_cualitativo_cuantitativo",
    "solo_precio_con_AN", "solo_precio_exclusivo",
    "precio_con_incremento_multas", "delegado_pliego_general",
    "indeterminado",
}
CONFIDENCE_ALIASES: Dict[str, str] = {
    "high": "alta", "medium": "media", "med": "media",
    "low": "baja", "very_low": "muy_baja",
}
CONFIDENCE_ALLOWED = {"alta", "media", "baja", "muy_baja"}
WEIGHT_TYPE_ALIASES: Dict[str, str] = {
    "puntos": "points", "puntaje": "points", "puntajes": "points",
    "porcentaje": "percent", "porcentajes": "percent", "porciento": "percent",
    "formula": "formula", "fórmula": "formula",
    "ninguno": "none", "sin": "none", "n_a": "none", "na": "none",
}
WEIGHT_TYPE_ALLOWED = {"points", "percent", "formula", "none"}
BLOCK_ALIASES: Dict[str, str] = {
    "cualitativo": "cualitativo", "calidad": "cualitativo",
    "cuantitativo": "cuantitativo", "cantidad": "cuantitativo",
}
BLOCK_ALLOWED = {"cualitativo", "cuantitativo"}

# SYSTEM_TYPE allows mixed case (e.g. "solo_precio_con_AN"). Map needs to
# preserve canonical casing — our normalizer strips case, so we patch:
SYSTEM_TYPE_ALLOWED_LOWER = {v.lower() for v in SYSTEM_TYPE_ALLOWED}


def _normalize_system_type(v):
    if not isinstance(v, str):
        return v
    norm = _strip_accents(v).lower().strip()
    # Canonical match (case-insensitive)
    for canon in SYSTEM_TYPE_ALLOWED:
        if canon.lower() == norm:
            return canon
    if norm in SYSTEM_TYPE_ALIASES:
        return SYSTEM_TYPE_ALIASES[norm]
    return v


_normalize_confidence = _make_normalizer(CONFIDENCE_ALIASES, CONFIDENCE_ALLOWED)
_normalize_weight_type = _make_normalizer(WEIGHT_TYPE_ALIASES, WEIGHT_TYPE_ALLOWED)
_normalize_block = _make_normalizer(BLOCK_ALIASES, BLOCK_ALLOWED)

# Canonical Eje-1 role vocabulary. Kept as a module-level constant so other
# services (requirements extractor, scoring engine) can import it as the
# single source of truth.
ROLE_NAMES = [
    "admisibilidad_obligatoria",
    "admisibilidad_subsanable",
    "puntuable",
    "penalizador",
    "informativo",
    "preferencia_legal",
]
# Special role that only applies when the pliego delegates evaluation to the
# general conditions document and that document hasn't been ingested yet.
ROLE_PENDING = "desconocido_pendiente_pliego_general"


class Discarded(BaseModel):
    discarded_types: List[str]
    reason: str


class EvaluationFactor(BaseModel):
    """
    A scoring factor instantiated from the particular pliego.

    `id` is the canonical vocabulary id (precio, antecedentes_publicos,
    antiguedad, calidad_tecnica, plazo_entrega, procedencia, garantia,
    postventa, sanciones_rupe, cantidad_items, formacion_rrhh, ...).
    Use `otro` when the pliego defines a factor that does not fit the
    canonical vocabulary and put the raw label in `label`.
    """
    id: str
    label: str
    weight_type: Literal["points", "percent", "formula", "none"]
    weight_value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None
    is_negative: bool = False
    citations: List[str] = Field(default_factory=list)

    @field_validator("weight_type", mode="before")
    @classmethod
    def _norm_weight_type(cls, v):
        return _normalize_weight_type(v)

    @field_validator("block", mode="before")
    @classmethod
    def _norm_block(cls, v):
        return _normalize_block(v) if v is not None else v


class RoleSignal(BaseModel):
    """Textual evidence that a given Eje-1 role is invoked by the pliego."""
    detected: bool
    evidence: List[str] = Field(default_factory=list)


class DetectedRoleSignals(BaseModel):
    """Per-role textual detection produced by the LLM."""
    admisibilidad_obligatoria: RoleSignal
    admisibilidad_subsanable: RoleSignal
    puntuable: RoleSignal
    penalizador: RoleSignal
    informativo: RoleSignal
    preferencia_legal: RoleSignal


class EvaluationProfile(BaseModel):
    """
    Full evaluation profile returned by the LLM.

    The `enabled_roles` / `profile_warnings` fields are filled in by Python
    after the LLM call by `compute_enabled_roles`, not by the LLM itself.
    """
    system_type: Literal[
        "puntos", "porcentajes", "mixto_cualitativo_cuantitativo",
        "solo_precio_con_AN", "solo_precio_exclusivo",
        "precio_con_incremento_multas", "delegado_pliego_general",
        "indeterminado",
    ]
    confidence: Literal["alta", "media", "baja", "muy_baja"]
    evidence: List[str]
    detected_factors: List[str]  # kept for backwards compatibility
    factors: List[EvaluationFactor]
    role_signals: DetectedRoleSignals
    discarded: Discarded
    sufficient_chunks: bool
    additional_chunks_recommendation: Optional[str] = None

    @field_validator("system_type", mode="before")
    @classmethod
    def _norm_system_type(cls, v):
        return _normalize_system_type(v)

    @field_validator("confidence", mode="before")
    @classmethod
    def _norm_confidence(cls, v):
        return _normalize_confidence(v)


# ---------------------------------------------------------------------------
# Static strategy -> role compatibility table
# ---------------------------------------------------------------------------
# For each evaluation strategy we declare:
#   - allowed:  roles that are logically possible under this strategy.
#   - required: roles that MUST be present under this strategy (validation).
#   - default_on: roles that are always considered enabled when allowed,
#                 even if the LLM did not surface specific textual evidence
#                 (used for roles that every pliego has by definition).
#   - pending_general: if True, the special ROLE_PENDING is enabled because
#                      the profile cannot be completed without the general
#                      conditions document.
STRATEGY_ROLE_RULES: Dict[str, Dict] = {
    "puntos": {
        "allowed": set(ROLE_NAMES),
        "required": set(),
        "default_on": {"admisibilidad_obligatoria", "informativo", "puntuable"},
        "pending_general": False,
    },
    "porcentajes": {
        "allowed": set(ROLE_NAMES),
        "required": set(),
        "default_on": {"admisibilidad_obligatoria", "informativo", "puntuable"},
        "pending_general": False,
    },
    "mixto_cualitativo_cuantitativo": {
        "allowed": set(ROLE_NAMES),
        "required": set(),
        "default_on": {"admisibilidad_obligatoria", "informativo", "puntuable"},
        "pending_general": False,
    },
    "solo_precio_con_AN": {
        # puntuable is allowed but applies ONLY to price.
        "allowed": set(ROLE_NAMES),
        "required": {"penalizador"},  # AN = TS + CS + PI is mandatory
        "default_on": {"admisibilidad_obligatoria", "informativo", "puntuable", "penalizador"},
        "pending_general": False,
    },
    "solo_precio_exclusivo": {
        # No scoring formulas at all -> puntuable and penalizador not possible.
        "allowed": {
            "admisibilidad_obligatoria",
            "admisibilidad_subsanable",
            "informativo",
            "preferencia_legal",
        },
        "required": set(),
        "default_on": {"admisibilidad_obligatoria", "informativo"},
        "pending_general": False,
    },
    "precio_con_incremento_multas": {
        "allowed": set(ROLE_NAMES),
        "required": {"penalizador"},  # A/B increment is mandatory
        "default_on": {"admisibilidad_obligatoria", "informativo", "puntuable", "penalizador"},
        "pending_general": False,
    },
    "delegado_pliego_general": {
        # The particular pliego may still define mandatory requirements and
        # informative items, but scoring/penalization depends on the general
        # conditions document which may not be loaded yet.
        "allowed": {
            "admisibilidad_obligatoria",
            "admisibilidad_subsanable",
            "informativo",
            "preferencia_legal",
        },
        "required": set(),
        "default_on": {"admisibilidad_obligatoria", "informativo"},
        "pending_general": True,
    },
    "indeterminado": {
        # Be permissive while the strategy is unknown so we don't silently
        # drop evidence; downstream must treat this as low-confidence.
        "allowed": set(ROLE_NAMES),
        "required": set(),
        "default_on": set(),
        "pending_general": False,
    },
}


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (Path(__file__).parent / "prompt_tender_evaluation_profile.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# RAG Queries for classification + profile extraction
# ---------------------------------------------------------------------------
# The first four queries target the evaluation strategy (unchanged).
# The next queries widen coverage so the LLM can also instantiate the factor
# vocabulary and detect role signals (subsanacion, preferencias legales,
# admisibilidad, sanciones RUPE, etc).
CLASSIFICATION_QUERIES = [
    "factores evaluacion puntaje maximo puntos porcentaje",
    "adjudicacion criterio precio exclusivo",
    "antecedentes negativos AN TS CS PI formula sanciones RUPE",
    "aspectos cualitativos cuantitativos ponderacion pliego condiciones generales",
    # Profile-extraction queries:
    "factor precio formula regla tres oferta menor mayor",
    "antecedentes empresa antiguedad formacion recursos humanos",
    "plazo entrega garantia procedencia post venta variedad",
    "requisitos obligatorios admisibilidad rechazo ofertas",
    "subsanable subsanacion plazo regularizar",
    "preferencia industria nacional PIN MIPYMES margen ley 18362",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None) -> dict | list | None:
    """Make an authenticated request to the backend API."""
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
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
    """Ensure all required environment variables are set."""
    missing = [
        var for var, val in [
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
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def get_embedding(client: OpenAI, text: str) -> List[float]:
    """Generates embedding using OpenAI text-embedding-3-small."""
    text = text.replace("\n", " ")
    response = client.embeddings.create(input=[text], model=EMBEDDING_MODEL)
    in_u, out_u, cached = openai_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "openai", EMBEDDING_MODEL, "embedding",
                 input_units=in_u, output_units=out_u, cached_input_units=cached, pricing=PRICING)
    return response.data[0].embedding


# ---------------------------------------------------------------------------
# Profile post-processing (enabled roles)
# ---------------------------------------------------------------------------
def compute_enabled_roles(
    system_type: str,
    role_signals: DetectedRoleSignals,
    factors: List[EvaluationFactor],
) -> Tuple[Dict[str, Dict], List[str]]:
    """
    Compute the final set of enabled roles for this pliego as the
    intersection of the static strategy rules and the textual role signals
    detected by the LLM. Also returns a list of warnings when the LLM
    output disagrees with the strategy (e.g. `puntuable` detected under
    `solo_precio_exclusivo`, or `penalizador` missing under
    `solo_precio_con_AN`).
    """
    rules = STRATEGY_ROLE_RULES.get(system_type, STRATEGY_ROLE_RULES["indeterminado"])
    allowed: Set[str] = rules["allowed"]
    required: Set[str] = rules["required"]
    default_on: Set[str] = rules["default_on"]

    # If the LLM found concrete scoring factors we treat `puntuable` as
    # textually detected even if the role_signals field was left empty.
    has_positive_factors = any(
        f.weight_type in ("points", "percent", "formula") and not f.is_negative
        for f in factors
    )
    has_negative_factors = any(f.is_negative for f in factors)

    enabled_roles: Dict[str, Dict] = {}
    warnings: List[str] = []

    for role in ROLE_NAMES:
        signal: RoleSignal = getattr(role_signals, role)
        text_detected = bool(signal.detected)

        # Upgrade puntuable/penalizador based on the factor list.
        if role == "puntuable" and has_positive_factors:
            text_detected = True
        if role == "penalizador" and has_negative_factors:
            text_detected = True

        strategy_allows = role in allowed
        forced_on = role in default_on and strategy_allows
        is_required = role in required

        enabled = strategy_allows and (text_detected or forced_on or is_required)

        if strategy_allows and text_detected:
            source = "both"
        elif strategy_allows and forced_on:
            source = "strategy_default"
        elif strategy_allows and is_required:
            source = "strategy_required"
        elif text_detected and not strategy_allows:
            source = "text_only_rejected"
        else:
            source = "none"

        # Validation warnings
        if text_detected and not strategy_allows:
            warnings.append(
                f"Role '{role}' detected in text but not permitted by strategy "
                f"'{system_type}'. Ignoring the textual detection."
            )
        if is_required and not text_detected and not has_negative_factors and role == "penalizador":
            warnings.append(
                f"Role '{role}' is required by strategy '{system_type}' but no "
                f"textual evidence was found. Check that the AN/multas annex was "
                f"indexed into Qdrant."
            )

        enabled_roles[role] = {
            "enabled": enabled,
            "source": source,
            "evidence": signal.evidence,
        }

    # Special pending role for delegado_pliego_general.
    pending_general = rules.get("pending_general", False)
    enabled_roles[ROLE_PENDING] = {
        "enabled": pending_general,
        "source": "strategy" if pending_general else "none",
        "evidence": [],
    }
    if pending_general:
        warnings.append(
            "Strategy is 'delegado_pliego_general': the profile is incomplete "
            "until the general conditions document is ingested into Qdrant. "
            "Downstream requirement classification should treat puntuable/"
            "penalizador as pending."
        )

    return enabled_roles, warnings


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure called with: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def retrieve_classification_chunks(
    qdrant: QdrantClient,
    openai_client: OpenAI,
    slug: str,
    analysis_id: str,
    top_k_per_query: int = 3,
) -> List[str]:
    """
    Retrieves the most relevant tender chunks for classification AND profile
    extraction by querying each per-file FILE_{slug}_{file_id} collection of
    category=tender. Aggregates results across files by best score per point.
    """
    tender_files = api_request(
        "POST",
        f"{API_PROCESSED_FILES_PATH}search",
        {"analysis_id": analysis_id, "category": "tender"},
    )
    if not isinstance(tender_files, list):
        raise RuntimeError(f"Unexpected response from processed-files search: {type(tender_files)}")

    collections: List[str] = []
    for f in tender_files:
        col = f"FILE_{slug}_{f['id']}"
        if qdrant.collection_exists(col):
            collections.append(col)
        else:
            logger.warning(f"Collection '{col}' missing; skipping file '{f.get('file_name')}'.")

    logger.info(f"Retrieving classification chunks from {len(collections)} per-file collections...")

    seen: Dict[str, Tuple[float, str]] = {}  # point_id -> (best_score, text)
    for query_text in CLASSIFICATION_QUERIES:
        query_vector = get_embedding(openai_client, query_text)
        for col in collections:
            search_result = qdrant.query_points(
                collection_name=col,
                query=query_vector,
                limit=top_k_per_query,
            )
            for point in search_result.points:
                pid = str(point.id)
                if pid not in seen or point.score > seen[pid][0]:
                    seen[pid] = (point.score, point.payload["text"])

    chunks = [text for _, text in sorted(seen.values(), key=lambda x: -x[0])]
    logger.info(f"Retrieved {len(chunks)} unique chunks from {len(CLASSIFICATION_QUERIES)} queries.")
    return chunks


def _gemini_classify(gemini_client: genai.Client, user_prompt: str, model: str) -> EvaluationProfile:
    response = gemini_client.models.generate_content(
        model=model,
        contents=[
            genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
            genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will return only a JSON evaluation profile matching the schema.")]),
            genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
        ],
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=EvaluationProfile,
            thinking_config=genai_types.ThinkingConfig(thinking_budget=GEMINI_THINKING_BUDGET),
        ),
    )
    in_u, out_u, cached = gemini_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "gemini", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached, pricing=PRICING)
    return EvaluationProfile.model_validate_json(response.text)


def _openai_classify(openai_client: OpenAI, user_prompt: str, model: str) -> EvaluationProfile:
    response = openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )
    in_u, out_u, cached = openai_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "openai", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached, pricing=PRICING)
    return EvaluationProfile.model_validate_json(response.choices[0].message.content)


def classify_tender(
    gemini_client: genai.Client,
    openai_client: OpenAI,
    chunks: List[str],
) -> EvaluationProfile:
    """Produces the full evaluation profile via the user-selected primary model, falling back to the other provider."""
    chunks_text = "\n---\n".join(chunks)
    user_prompt = (
        "Analyze the following Uruguayan procurement document and produce the "
        "full evaluation profile (system_type + factors + role_signals).\n\n"
        f"<rag_context>\n{chunks_text}\n</rag_context>"
    )

    last_error = None
    for provider, model in [(PRIMARY_PROVIDER, PRIMARY_MODEL), (FALLBACK_PROVIDER, FALLBACK_MODEL)]:
        if not model:
            continue
        try:
            if provider == "gemini":
                return _gemini_classify(gemini_client, user_prompt, model)
            return _openai_classify(openai_client, user_prompt, model)
        except Exception as e:
            last_error = e
            logger.warning(f"{provider}/{model} failed ({e}), trying next...")
    raise last_error


def save_classification(
    analysis_id: str,
    result: EvaluationProfile,
    enabled_roles: Dict[str, Dict],
    profile_warnings: List[str],
):
    """Saves the full evaluation profile via API."""
    payload = {
        "analysis_id": analysis_id,
        # Strategy classification (backwards compatible fields)
        "system_type": result.system_type,
        "confidence": result.confidence,
        "evidence": result.evidence,
        "detected_factors": result.detected_factors,
        "discarded": result.discarded.model_dump(),
        "sufficient_chunks": result.sufficient_chunks,
        "additional_chunks_recommendation": result.additional_chunks_recommendation,
        # Evaluation profile (new fields)
        "factors": [f.model_dump() for f in result.factors],
        "role_signals": result.role_signals.model_dump(),
        "enabled_roles": enabled_roles,
        "profile_warnings": profile_warnings,
    }
    api_request("POST", API_TENDER_CLASSIFICATIONS_PATH, payload)
    logger.info("Evaluation profile saved successfully.")


def process_classification():
    logger.info(f"Starting tender-classifier for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    log_event(ANALYSIS_ID, "info", "Iniciando clasificación del sistema de evaluación...", EVENT_SOURCE)

    # 1. Get collection name (slug) via API
    analysis = api_request("GET", f"{API_ANALYSES_PATH}{ANALYSIS_ID}")
    slug = analysis["slug"]
    logger.info(f"Target Qdrant collection: {slug}")

    # 2. Retrieve relevant chunks via semantic search
    chunks = retrieve_classification_chunks(qdrant, openai_client, slug, ANALYSIS_ID)
    if not chunks:
        msg = "No tender chunks found for this analysis in Qdrant."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        try:
            api_request("POST", API_JOBS_CALLBACK, {
                "service_name": SERVICE_NAME,
                "analysis_id": ANALYSIS_ID,
                "status": "success"
            })
        except Exception as e:
            logger.error(f"Failed to notify job callback: {e}")
        return

    # 3. Build the evaluation profile via LLM
    logger.info(f"Building evaluation profile with {len(chunks)} chunks...")
    result = classify_tender(gemini_client, openai_client, chunks)

    # 4. Compute enabled roles (intersection of strategy rules + text signals)
    enabled_roles, profile_warnings = compute_enabled_roles(
        result.system_type, result.role_signals, result.factors
    )
    for w in profile_warnings:
        logger.warning(f"profile_warning: {w}")
        log_event(ANALYSIS_ID, "warning", w, EVENT_SOURCE)

    # 5. Save result
    save_classification(ANALYSIS_ID, result, enabled_roles, profile_warnings)

    # 6. Log summary and notify success
    enabled_list = [r for r, v in enabled_roles.items() if v["enabled"]]
    summary = (
        f"Clasificacion completada: {result.system_type} "
        f"(confianza: {result.confidence}) | factores: {len(result.factors)} "
        f"| roles habilitados: {', '.join(enabled_list) or 'ninguno'}"
    )
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE, {
        "system_type": result.system_type,
        "confidence": result.confidence,
        "detected_factors": result.detected_factors,
        "factor_count": len(result.factors),
        "enabled_roles": enabled_list,
        "profile_warnings_count": len(profile_warnings),
    })

    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success"
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def main():
    global PRICING
    validate_env()
    resolve_model_config()
    PRICING = load_pricing()
    try:
        process_classification()
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
