"""
Tender Classifier Service
=========================
Classifies the bid evaluation/scoring system used in a Uruguayan public
procurement document (pliego de licitacion).

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
from typing import List, Optional, Literal, Dict, Tuple

import requests
from openai import OpenAI
from google import genai
from google.genai import types as genai_types
from qdrant_client import QdrantClient
from qdrant_client.http import models
from pydantic import BaseModel

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


class Discarded(BaseModel):
    discarded_types: List[str]
    reason: str


class TenderClassification(BaseModel):
    system_type: Literal[
        "puntos", "porcentajes", "mixto_cualitativo_cuantitativo",
        "solo_precio_con_AN", "solo_precio_exclusivo",
        "precio_con_incremento_multas", "delegado_pliego_general",
        "indeterminado",
    ]
    confidence: Literal["alta", "media", "baja", "muy_baja"]
    evidence: List[str]
    detected_factors: List[str]
    discarded: Discarded
    sufficient_chunks: bool
    additional_chunks_recommendation: Optional[str] = None


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are a classifier specialized in Uruguayan public procurement documents ("pliegos de licitacion"). Your task is to analyze text fragments retrieved from a procurement document and classify the type of bid evaluation/scoring system used.

You will receive text chunks from a RAG system. These chunks may be incomplete, out of order, or noisy due to PDF extraction. Despite this, you must identify the evaluation system type based on the signals present.

### CLASSIFICATION TYPES

Classify into exactly ONE of the following 7 types:

#### 1. "puntos" -- Point-Based Scoring System
Multiple evaluation factors are assigned numerical points that sum to approximately 100. The bidder with the highest total score wins.

**Strong signals (any one is sufficient):**
- Tables or lists with "maximo X puntos" (maximum X points)
- "FACTOR 1: 60 puntos", "FACTOR 2: 15 puntos"
- "Puntaje maximo: 100"
- "puntaje de evaluacion economica = 50 x (PME/PEv)"
- "se otorgaran 15 puntos", "se puntuara con 10 (diez) puntos"
- "Puntaje Total = Puntaje de Evaluacion Economica + Puntaje de Antecedentes + ..."
- Discrete scales like: "de 1 a 3 antecedentes = 5 puntos, de 4 a 6 = 10 puntos"
- "Evaluacion economica (precio) ... 50 ... Antecedentes de la empresa ... 30 ... Formacion ... 20"
- "(Precio a comparar/mayor precio) x 40 = puntaje por precio"
- "(Oferta a considerar/Oferta mas conveniente) x 20 = puntaje obtenido"

**Typical factors found in this type:**
- Price (Precio / Evaluacion economica): 40-70 points
- Positive track record (Antecedentes positivos): 10-30 points, from public/private entities
- Company age (Antiguedad de la empresa): 5-10 points
- HR qualifications (Formacion de recursos humanos): 10-20 points
- Technical quality (Calidad): sub-parameters with individual point scales
- Delivery time (Plazo de entrega): point scales by days
- Origin (Procedencia): geographic region scales
- Warranty (Garantia): scales by years or kilometers
- After-sales service (Servicios post-venta)
- Product variety (Variedad de productos)
- Negative antecedents (Antecedentes negativos): SUBTRACTED from total, typically -1 to -12

**Distinguishing from "porcentajes":** If values are labeled as "puntos" or have no "%" symbol, it is "puntos". If values use "%" explicitly, see type 2.

---

#### 2. "porcentajes" -- Percentage-Based Scoring System
Evaluation factors are expressed as percentages that sum to 100%. Each factor has its own internal calculation method.

**Strong signals (any one is sufficient):**
- "PRECIO 65%", "PRECIO 75%"
- "ANTECEDENTES DEL OFERENTE: 10%"
- "SANCIONES EN R.U.P.E.: 10%"
- "OFERTA POR LA MAYOR CANTIDAD DE ITEMS: 15%"
- "Se otorgara 65% a la oferta de menor precio"
- Factors listed with explicit "%" symbols summing to 100%

**Distinguishing from "puntos":** The key differentiator is the "%" symbol and factors explicitly described as percentages.

---

#### 3. "mixto_cualitativo_cuantitativo" -- Mixed Qualitative/Quantitative System
Two weighted blocks: a Qualitative block (typically 60%) with multiple sub-factors, and a Quantitative block (typically 40%) evaluating only price.

**Strong signals (combination needed):**
- "Aspecto Cualitativo" AND "Aspecto Cuantitativo"
- Formula like: "A + B, donde A = (Puntaje Cualitativo x 0.6) y B = (Puntaje Cuantitativo x 0.4)"
- "EVALUACION ... PONDERACION ... A) Aspectos Cualitativos 60% ... B) Aspectos Cuantitativos 40%"
- "Puntaje Cuantitativo = 100 x Pb / Pi"

**Distinguishing from "puntos":** The key differentiator is the TWO-BLOCK structure with explicit weights.

---

#### 4. "solo_precio_con_AN" -- Price-Only with Negative Antecedents Formula
Price is the only factor, but a mathematical formula (AN = TS + CS + PI) adjusts the comparison value.

**Strong signals (combination needed):**
- "Se le otorgara valor 100 a la oferta de mayor precio"
- "regla de tres directa" (NOT inversa)
- "AN = TS + CS + PI" or "Antecedentes negativos (AN) = TS + CS + PI"
- "Al puntaje obtenido ... se le sumara los antecedentes negativos"
- TS/CS/PI tables with specific values

**CRITICAL distinction:** Value 100 goes to the HIGHEST price (worst offer). The LOWEST total value wins.

---

#### 5. "solo_precio_exclusivo" -- Exclusive Price-Only Adjudication
No scoring, no weighting, no formulas. Awarded to the lowest-priced bid that meets requirements.

**Strong signals (any one is sufficient):**
- "en base exclusiva al factor precio"
- "adjudicados en base exclusiva al factor precio"
- "exclusivamente de acuerdo al Monto Total de Comparacion"
- "se adjudicara al de menor precio"
- Complete ABSENCE of scoring tables, factors, weightings

---

#### 6. "precio_con_incremento_multas" -- Price with Historical Fines Increment
Price is the main criterion, but fictitiously increased based on historical fines.

**Strong signals (combination needed):**
- "el precio cotizado se incrementara"
- "solo a los efectos comparativos"
- Formula involving A/B where: A = sum of fines in UR, B = total awarded in UR
- "conducta comercial de los oferentes"

---

#### 7. "delegado_pliego_general" -- Evaluation Delegated to General Conditions Document
The document does NOT define its own evaluation criteria; references the General Conditions.

**Strong signals (combination needed):**
- "de acuerdo a lo establecido en el pliego de Condiciones Generales"
- ABSENCE of any scoring table, weighting, or evaluation formula
- Reference to "Capitulo X del Pliego de Condiciones Generales" for evaluation

---

### DECISION TREE (use this order)

1. Does the document contain "AN = TS + CS + PI" or an ANNEX with TS/CS/PI tables? -> **solo_precio_con_AN**
2. Does the document contain a formula for incrementing price by historical fines (A/B, multas en UR)? -> **precio_con_incremento_multas**
3. Does the document contain "Aspecto Cualitativo" AND "Aspecto Cuantitativo" with weighted blocks? -> **mixto_cualitativo_cuantitativo**
4. Does the document list factors with "%" symbols summing to ~100%? -> **porcentajes**
5. Does the document list factors with "puntos" or numeric maximums summing to ~100? -> **puntos**
6. Does the document explicitly state "en base exclusiva al factor precio" or "exclusivamente por Monto Total"? -> **solo_precio_exclusivo**
7. Does the document reference the General Conditions for evaluation with no criteria of its own? -> **delegado_pliego_general**
8. If none match clearly -> Return confidence "baja" with the best guess

### HANDLING INCOMPLETE INFORMATION

The RAG system may only return partial chunks. If the chunks you receive:
- Contain evaluation criteria -> classify based on what you see
- Contain NO evaluation-related content at all -> respond with "system_type": "indeterminado" and "confidence": "muy_baja"
- Contain contradictory signals -> prefer the type suggested by the most specific signal

### OUTPUT FORMAT

Respond ONLY with a JSON object:

```json
{
  "system_type": "puntos",
  "confidence": "alta",
  "evidence": ["Exact quote 1 from the text", "Exact quote 2 if available"],
  "detected_factors": ["Precio", "Antecedentes", "Formacion RRHH"],
  "discarded": {
    "discarded_types": ["porcentajes", "solo_precio_exclusivo"],
    "reason": "Factors use 'puntos' not '%'; multiple factors present (not price-only)"
  },
  "sufficient_chunks": true,
  "additional_chunks_recommendation": null
}
```

If information is insufficient:
```json
{
  "system_type": "indeterminado",
  "confidence": "muy_baja",
  "evidence": [],
  "detected_factors": [],
  "discarded": {
    "discarded_types": [],
    "reason": "No evaluation criteria found in provided chunks"
  },
  "sufficient_chunks": false,
  "additional_chunks_recommendation": "Need chunks from sections: 'Evaluacion de ofertas', 'Adjudicacion', 'Factores de ponderacion', or any ANEXO related to evaluation"
}
```"""


# ---------------------------------------------------------------------------
# RAG Queries for classification
# ---------------------------------------------------------------------------
CLASSIFICATION_QUERIES = [
    "factores evaluacion puntaje maximo puntos porcentaje",
    "adjudicacion criterio precio exclusivo",
    "antecedentes negativos AN TS CS PI formula sanciones RUPE",
    "aspectos cualitativos cuantitativos ponderacion pliego condiciones generales",
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
    Retrieves the most relevant tender chunks for classification.
    Uses 4 targeted semantic queries, deduplicates by point ID, and returns
    ordered by relevance score (8-12 chunks ideal).
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
) -> TenderClassification:
    """Classifies the tender evaluation system using Gemini (primary) or OpenAI (fallback)."""
    chunks_text = "\n---\n".join(chunks)
    user_prompt = (
        "Classify the bid evaluation system used in the following Uruguayan procurement document.\n\n"
        f"<rag_context>\n{chunks_text}\n</rag_context>"
    )

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
                genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will classify the bid evaluation system based on the provided chunks and return only a JSON object.")]),
                genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TenderClassification,
            ),
        )
        return TenderClassification.model_validate_json(response.text)
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
        return TenderClassification.model_validate_json(response.choices[0].message.content)


def save_classification(analysis_id: str, result: TenderClassification):
    """Saves the classification result via API."""
    payload = {
        "analysis_id": analysis_id,
        "system_type": result.system_type,
        "confidence": result.confidence,
        "evidence": result.evidence,
        "detected_factors": result.detected_factors,
        "discarded": result.discarded.model_dump(),
        "sufficient_chunks": result.sufficient_chunks,
        "additional_chunks_recommendation": result.additional_chunks_recommendation,
    }
    api_request("POST", API_TENDER_CLASSIFICATIONS_PATH, payload)
    logger.info("Classification saved successfully.")


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

    # 3. Classify using LLM
    logger.info(f"Classifying with {len(chunks)} chunks...")
    result = classify_tender(gemini_client, openai_client, chunks)

    # 4. Save result
    save_classification(ANALYSIS_ID, result)

    # 5. Log summary and notify success
    summary = f"Clasificacion completada: {result.system_type} (confianza: {result.confidence})"
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE, {
        "system_type": result.system_type,
        "confidence": result.confidence,
        "detected_factors": result.detected_factors,
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
