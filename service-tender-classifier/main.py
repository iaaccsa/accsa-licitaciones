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
  - API_TENDER_CLASSIFICATIONS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID
"""

import os
import sys
from typing import List, Optional, Literal, Dict, Tuple, Set

import requests
from openai import OpenAI
from google import genai
from google.genai import types as genai_types
from qdrant_client import QdrantClient
from qdrant_client.http import models
from pydantic import BaseModel, Field

from supabase_logger import setup_logger, log_event, make_session

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
API_TENDER_CLASSIFICATIONS_PATH = os.environ.get("API_TENDER_CLASSIFICATIONS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-tender-classifier"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_MODEL = "gemini-3.1-pro-preview"
OPENAI_FALLBACK_MODEL = "gpt-5.4"

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
SYSTEM_PROMPT = """You are a classifier specialized in Uruguayan public procurement documents ("pliegos de licitacion"). Your task is to analyze text fragments retrieved from a procurement document and produce a full EVALUATION PROFILE of the pliego.

You will receive text chunks from a RAG system. These chunks may be incomplete, out of order, or noisy due to PDF extraction. Despite this, you must (a) identify the evaluation system type, (b) instantiate the list of scoring factors used by this specific pliego, and (c) report textual signals for each requirement role.

### TASK 1 -- CLASSIFY THE EVALUATION SYSTEM TYPE

Classify into exactly ONE of the following 7 types:

#### 1. "puntos" -- Point-Based Scoring System
Multiple evaluation factors are assigned numerical points that sum to approximately 100. The bidder with the highest total score wins.

**Strong signals (any one is sufficient):**
- Tables or lists with "maximo X puntos"
- "FACTOR 1: 60 puntos", "FACTOR 2: 15 puntos"
- "Puntaje maximo: 100"
- "puntaje de evaluacion economica = 50 x (PME/PEv)"
- "se otorgaran 15 puntos", "se puntuara con 10 (diez) puntos"
- "Puntaje Total = Puntaje de Evaluacion Economica + Puntaje de Antecedentes + ..."
- Discrete scales like: "de 1 a 3 antecedentes = 5 puntos, de 4 a 6 = 10 puntos"
- "(Precio a comparar/mayor precio) x 40 = puntaje por precio"

#### 2. "porcentajes" -- Percentage-Based Scoring System
Factors expressed as percentages that sum to 100%.

**Strong signals:** "PRECIO 65%", "ANTECEDENTES DEL OFERENTE: 10%", explicit "%" symbols summing to 100%.

#### 3. "mixto_cualitativo_cuantitativo" -- Mixed Qualitative/Quantitative
Two weighted blocks: Cualitativo (usually 60%) and Cuantitativo (usually 40%). Look for "Aspecto Cualitativo" AND "Aspecto Cuantitativo" together, "A + B, donde A = (Puntaje Cualitativo x 0.6)".

#### 4. "solo_precio_con_AN" -- Price-Only with Negative Antecedents Formula
"Se le otorgara valor 100 a la oferta de mayor precio" + "regla de tres directa" + "AN = TS + CS + PI". Value 100 goes to the HIGHEST price; the LOWEST total value wins.

#### 5. "solo_precio_exclusivo" -- Exclusive Price-Only
"en base exclusiva al factor precio", "exclusivamente de acuerdo al Monto Total de Comparacion". Complete absence of scoring tables.

#### 6. "precio_con_incremento_multas" -- Price with Historical Fines Increment
"el precio cotizado se incrementara", "solo a los efectos comparativos", formula A/B with fines in UR.

#### 7. "delegado_pliego_general" -- Evaluation Delegated to General Conditions
"de acuerdo a lo establecido en el pliego de Condiciones Generales", absence of scoring tables.

### DECISION TREE (use this order)
1. "AN = TS + CS + PI" or TS/CS/PI tables? -> solo_precio_con_AN
2. Formula A/B with multas en UR? -> precio_con_incremento_multas
3. "Aspecto Cualitativo" AND "Aspecto Cuantitativo" with weights? -> mixto_cualitativo_cuantitativo
4. Factors with "%" summing to ~100%? -> porcentajes
5. Factors with "puntos" summing to ~100? -> puntos
6. Explicit "en base exclusiva al factor precio"? -> solo_precio_exclusivo
7. References Pliego General with no own criteria? -> delegado_pliego_general
8. None match clearly -> confidence "baja" with best guess, or "indeterminado" if no evaluation content at all.

### TASK 2 -- INSTANTIATE THE FACTOR VOCABULARY

For the specific pliego in the chunks, produce the list of scoring factors it actually uses. Each factor must include:

- `id`: canonical id from this controlled vocabulary (use the closest match):
  precio, antecedentes_publicos, antecedentes_privados, antecedentes_generales,
  antecedentes_negativos, antiguedad, calidad_tecnica, plazo_entrega,
  procedencia, garantia, postventa, formacion_rrhh, cantidad_items,
  sanciones_rupe, variedad_productos, otro
- `label`: the literal text used by the pliego (e.g. "Evaluacion Economica", "Formacion de Recursos Humanos").
- `weight_type`: one of "points" | "percent" | "formula" | "none".
- `weight_value`: numeric weight when extractable (e.g. 60 for "60 puntos" or 65 for "65%"), null otherwise.
- `formula`: raw formula copied from the pliego (e.g. "50 x (PME/PEv)"), null if none.
- `block`: "cualitativo" or "cuantitativo" only for "mixto_cualitativo_cuantitativo"; null otherwise.
- `is_negative`: true if the factor subtracts from the total (antecedentes negativos, AN, increment by fines).
- `citations`: one or two short literal quotes from the chunks that justify this factor.

Rules:
- Do NOT invent factors that are not in the chunks. If a factor is implied but not explicit, omit it and mention it in `additional_chunks_recommendation`.
- For "solo_precio_exclusivo" the factors list should be empty or contain only a single `precio` factor with `weight_type: "none"`.
- For "solo_precio_con_AN" include a `precio` factor (weight_type "formula") and an `antecedentes_negativos` factor with `is_negative: true`.
- For "mixto_cualitativo_cuantitativo" every factor must have `block` set.

### TASK 3 -- DETECT ROLE SIGNALS (Eje 1)

Report textual evidence of each requirement role. These are per-role booleans plus short literal quotes. The roles are:

- `admisibilidad_obligatoria`: mandatory pass/fail requirements (e.g. "deberan presentar", "sera requisito", "no seran consideradas las ofertas que"). Almost every pliego has some.
- `admisibilidad_subsanable`: mentions of things that can be subsanated within a deadline ("subsanable", "podra subsanarse", "dentro del plazo de 48 horas").
- `puntuable`: scoring factors that produce points/percent (if TASK 1 found factors, this is detected).
- `penalizador`: requirements whose breach subtracts points or worsens the comparison value. Look for antecedentes negativos, sanciones RUPE that subtract, AN = TS+CS+PI, A/B increment by fines.
- `informativo`: things the pliego asks bidders to declare but that neither gate admission nor score (e.g. "a efectos informativos", declarative forms).
- `preferencia_legal`: legal preference regimes (PIN "Productos de Industria Nacional", MIPYMES, margen de preferencia, ley 18.362, subprograma de contratacion publica para el desarrollo).

For each role set `detected: true/false` and include 0-3 short literal quotes as `evidence`. If you are unsure, set `detected: false` and leave `evidence` empty.

### HANDLING INCOMPLETE INFORMATION
- Chunks with no evaluation content -> `system_type: "indeterminado"`, `confidence: "muy_baja"`, empty factors, all role signals `detected: false`.
- Contradictory signals -> prefer the most specific (e.g. an explicit AN formula outweighs a generic "menor precio").
- If factor information is partially visible, include what you can justify and set `sufficient_chunks: false` with a targeted `additional_chunks_recommendation`.

### OUTPUT FORMAT

Respond ONLY with a JSON object of this shape:

```json
{
  "system_type": "puntos",
  "confidence": "alta",
  "evidence": ["Exact quote 1", "Exact quote 2"],
  "detected_factors": ["Precio", "Antecedentes publicos", "Formacion RRHH"],
  "factors": [
    {
      "id": "precio",
      "label": "Evaluacion economica",
      "weight_type": "points",
      "weight_value": 60,
      "formula": "60 x (PME/PEv)",
      "block": null,
      "is_negative": false,
      "citations": ["FACTOR 1 (Precio): 60 puntos"]
    }
  ],
  "role_signals": {
    "admisibilidad_obligatoria": {"detected": true,  "evidence": ["deberan presentar certificado ..."]},
    "admisibilidad_subsanable":  {"detected": false, "evidence": []},
    "puntuable":                 {"detected": true,  "evidence": ["FACTOR 1 (Precio): 60 puntos"]},
    "penalizador":               {"detected": true,  "evidence": ["Antecedentes negativos: se restaran ..."]},
    "informativo":               {"detected": true,  "evidence": ["a efectos informativos ..."]},
    "preferencia_legal":         {"detected": false, "evidence": []}
  },
  "discarded": {
    "discarded_types": ["porcentajes", "solo_precio_exclusivo"],
    "reason": "Factors use 'puntos' not '%'; multiple factors present"
  },
  "sufficient_chunks": true,
  "additional_chunks_recommendation": null
}
```
"""


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
    return client.embeddings.create(input=[text], model=EMBEDDING_MODEL).data[0].embedding


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
    collection_name: str,
    analysis_id: str,
    top_k_per_query: int = 3,
) -> List[str]:
    """
    Retrieves the most relevant tender chunks for classification AND profile
    extraction. Uses the targeted semantic queries above, deduplicates by
    point ID, and returns them ordered by relevance score.
    """
    logger.info(f"Retrieving classification chunks from '{collection_name}'...")

    query_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="category", match=models.MatchValue(value="tender")),
        ]
    )

    seen: Dict[str, Tuple[float, str]] = {}  # point_id -> (best_score, text)

    for query_text in CLASSIFICATION_QUERIES:
        query_vector = get_embedding(openai_client, query_text)
        search_result = qdrant.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=top_k_per_query,
            query_filter=query_filter,
        )
        for point in search_result.points:
            pid = str(point.id)
            if pid not in seen or point.score > seen[pid][0]:
                seen[pid] = (point.score, point.payload["text"])

    chunks = [text for _, text in sorted(seen.values(), key=lambda x: -x[0])]
    logger.info(f"Retrieved {len(chunks)} unique chunks from {len(CLASSIFICATION_QUERIES)} queries.")
    return chunks


def classify_tender(
    gemini_client: genai.Client,
    openai_client: OpenAI,
    chunks: List[str],
) -> EvaluationProfile:
    """Produces the full evaluation profile via Gemini (primary) / OpenAI (fallback)."""
    chunks_text = "\n---\n".join(chunks)
    user_prompt = (
        "Analyze the following Uruguayan procurement document and produce the "
        "full evaluation profile (system_type + factors + role_signals).\n\n"
        f"<rag_context>\n{chunks_text}\n</rag_context>"
    )

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
                genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will return only a JSON evaluation profile matching the schema.")]),
                genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=EvaluationProfile,
            ),
        )
        return EvaluationProfile.model_validate_json(response.text)
    except Exception as e:
        logger.warning(f"Gemini failed ({e}), falling back to OpenAI ({OPENAI_FALLBACK_MODEL})...")
        response = openai_client.chat.completions.create(
            model=OPENAI_FALLBACK_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        return EvaluationProfile.model_validate_json(response.choices[0].message.content)


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

    log_event(ANALYSIS_ID, "info", "Iniciando clasificacion del sistema de evaluacion...", EVENT_SOURCE)

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
    validate_env()
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
