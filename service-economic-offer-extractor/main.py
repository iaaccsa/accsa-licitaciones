"""
Economic Offer Extractor Service
================================
Given an ANALYSIS_ID and a PROPOSAL_ID, extracts the structured economic
offer from the proposal's indexed chunks in Qdrant and upserts a single
record into `proposal_economic_offers`.

Extracts: total_amount, currency, includes_taxes, tax_details,
payment_terms, validity_days, adjustment_formula, line_items, citations.

Required environment variables:
  - GOOGLE_API_KEY
  - OPENAI_API_KEY
  - QDRANT_URL
  - QDRANT_API_KEY
  - API_BASE_URL
  - API_KEY
  - API_EVENTS_PATH
  - API_ANALYSES_PATH
  - API_PROPOSALS_PATH
  - API_TENDER_CLASSIFICATIONS_PATH
  - API_PROPOSAL_ECONOMIC_OFFERS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID        (runtime)
  - PROPOSAL_ID        (runtime)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

import requests
from google import genai
from google.genai import types as genai_types
from openai import OpenAI
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.http import models

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
API_PROPOSALS_PATH = os.environ.get("API_PROPOSALS_PATH")
API_TENDER_CLASSIFICATIONS_PATH = os.environ.get("API_TENDER_CLASSIFICATIONS_PATH")
API_PROPOSAL_ECONOMIC_OFFERS_PATH = os.environ.get("API_PROPOSAL_ECONOMIC_OFFERS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")

SERVICE_NAME = "service-economic-offer-extractor"
SERVICE_VERSION = "1.0.0"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_MODEL = "gemini-3.1-pro-preview"
OPENAI_FALLBACK_MODEL = "gpt-5.4"

RAG_TOP_K_PER_QUERY = 5
RAG_MAX_TOTAL_CHUNKS = 20
LLM_RETRY_ATTEMPTS = 2
LLM_RETRY_BACKOFF_BASE = 1.5

# Thematic queries used for RAG retrieval on the proposal chunks.
# Each query is embedded and searched independently; results are deduplicated
# by chunk_id and capped at RAG_MAX_TOTAL_CHUNKS.
RAG_QUERIES = [
    "precio total monto de la oferta economica cotizacion",
    "moneda de la oferta pesos uruguayos dolares UI UYU USD",
    "IVA impuestos gravamenes incluidos no incluidos",
    "plazo de pago condiciones comerciales dias fecha factura",
    "mantenimiento de oferta plazo de validez de la cotizacion",
    "formula parametrica de ajuste de precios reajuste",
    "desglose por items renglones lotes precio unitario cantidad subtotal",
]

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
class EconomicCitation(BaseModel):
    chunk_id: str
    snippet: str
    header: Optional[str] = None
    chunk_index: Optional[int] = None


class EconomicLineItem(BaseModel):
    code: Optional[str] = None
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    subtotal: Optional[float] = None
    currency: Optional[str] = None


class LLMEconomicOffer(BaseModel):
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    includes_taxes: Optional[bool] = None
    tax_details: Optional[Dict[str, Any]] = None
    payment_terms: Optional[str] = None
    validity_days: Optional[int] = None
    adjustment_formula: Optional[str] = None
    line_items: List[EconomicLineItem] = Field(default_factory=list)
    citations: List[EconomicCitation] = Field(default_factory=list)
    confidence: Literal["alta", "media", "baja", "muy_baja"] = "media"
    reasoning: Optional[str] = None
    requires_manual_review: bool = False


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are an economic offer extractor for Uruguayan public
procurement. Your job is to extract the STRUCTURED economic offer from a
specific bidder's proposal, based on chunks retrieved from that proposal.

You will receive:
  - bidder info (name, provider)
  - tender context (system type, expected currency, whether the pliego asks
    for prices with or without taxes; may be empty)
  - retrieved_chunks: relevant chunks from the bidder's proposal. Each chunk
    includes chunk_id, header, chunk_index and text.

### Fields to extract

- total_amount        -> total offered amount as a number (no currency symbol,
                         no thousands separators). If you cannot find a
                         single explicit total, leave it null and populate
                         line_items instead.
- currency            -> ISO-like code in UPPERCASE: "UYU", "USD", "EUR",
                         "UI", "UR". If the proposal mixes several currencies,
                         pick the main one for total_amount and explain it
                         in `reasoning`.
- includes_taxes      -> true if total_amount already INCLUDES VAT/IVA and
                         any other taxes; false if it is expressed "mas
                         impuestos" / "sin IVA"; null if not stated.
- tax_details         -> optional object with tax breakdown when the bidder
                         declares it, e.g.
                         { "iva": { "rate": 22, "amount": 12345.67 } }
- payment_terms       -> free text exactly as the bidder declares
                         (e.g. "30 dias fecha factura", "contado contra
                         entrega"). null if not stated.
- validity_days       -> integer number of days the bidder commits to hold
                         the offer. null if not stated.
- adjustment_formula  -> parametric price adjustment formula as free text,
                         exactly as the bidder writes it. null if none.
- line_items          -> optional array of line items / renglones / lotes,
                         each with: code, description, quantity, unit_price,
                         subtotal, currency. Leave empty if the offer is
                         lump-sum (mono-item).
- citations           -> list of the chunks that support the extracted values.
                         Every citation MUST use `chunk_id` EXACTLY as
                         provided in the input. Include at most 4 citations.
                         Each has: chunk_id, snippet (literal quote, <=300
                         chars), header, chunk_index.
- confidence          -> alta | media | baja | muy_baja for the WHOLE extraction.
- reasoning           -> 1-3 short sentences in Spanish explaining normalization
                         decisions (why you picked the currency, how you
                         reconciled total vs line_items, etc.).
- requires_manual_review -> true when ANY of the following holds:
                         * the offer mixes several currencies in conflicting
                           ways
                         * total_amount conflicts with the sum of line_items
                         * the proposal explicitly says the offer is
                           "a determinar" / "a definir"
                         * critical fields are ambiguous or contradictory
                         false otherwise.

### Hard rules (will be validated)

1. Return ONLY the JSON object described below, no wrapper, no prose.
2. `currency` must be uppercase if present.
3. `chunk_id` values in citations MUST come from `retrieved_chunks`.
4. Numeric fields must be numbers, not strings. No thousand separators, no
   currency symbols in numeric fields.
5. If the chunks contain NO economic information at all, return a mostly-null
   object with `confidence = "muy_baja"`, `requires_manual_review = true`,
   and explain in `reasoning` that no economic info was found.

### Output format (ONLY this JSON object)

{
  "total_amount": 1245678.50,
  "currency": "UYU",
  "includes_taxes": true,
  "tax_details": { "iva": { "rate": 22, "amount": 224628.00 } },
  "payment_terms": "30 dias fecha factura",
  "validity_days": 60,
  "adjustment_formula": "P = P0 * (0.5 * IPC/IPC0 + 0.5 * TC/TC0)",
  "line_items": [
    {
      "code": "1.1",
      "description": "Licenciamiento anual",
      "quantity": 1,
      "unit_price": 980000.00,
      "subtotal": 980000.00,
      "currency": "UYU"
    }
  ],
  "citations": [
    {
      "chunk_id": "qdrant_point_abc123",
      "snippet": "El monto total de la oferta asciende a $ 1.245.678,50 (pesos uruguayos) IVA incluido.",
      "header": "OFERTA ECONOMICA",
      "chunk_index": 7
    }
  ],
  "confidence": "alta",
  "reasoning": "El total coincide con la suma de los items. El oferente declara IVA incluido.",
  "requires_manual_review": false
}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None, params: dict | None = None) -> dict | list | None:
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, params=params, headers=API_HEADERS, timeout=60)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
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
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_TENDER_CLASSIFICATIONS_PATH", API_TENDER_CLASSIFICATIONS_PATH),
            ("API_PROPOSAL_ECONOMIC_OFFERS_PATH", API_PROPOSAL_ECONOMIC_OFFERS_PATH),
            ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
            ("ANALYSIS_ID", ANALYSIS_ID),
            ("PROPOSAL_ID", PROPOSAL_ID),
        ]
        if not val
    ]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def get_embedding(client: OpenAI, text: str) -> List[float]:
    text = text.replace("\n", " ")
    return client.embeddings.create(input=[text], model=EMBEDDING_MODEL).data[0].embedding


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------
def mark_economic_start(proposal_id: str):
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/economic-start", {
        "economic_started_at": now,
    })
    logger.info(f"Proposal {proposal_id} transitioned to extracting.")


def mark_economic_result(proposal_id: str):
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/economic-result", {
        "economic_completed_at": now,
    })
    logger.info(f"Proposal {proposal_id} transitioned to ready.")


def mark_economic_failure(proposal_id: str, error: str):
    try:
        now = datetime.now(timezone.utc).isoformat()
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/economic-failure", {
            "economic_completed_at": now,
            "economic_error": error,
        })
    except Exception as e:
        logger.error(f"Failed to mark economic-failure: {e}")


def notify_success():
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def notify_failure(error_msg: str):
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_analysis(analysis_id: str) -> dict:
    result = api_request("GET", f"{API_ANALYSES_PATH}{analysis_id}")
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response from analyses: {type(result)}")
    return result


def load_proposal(proposal_id: str) -> dict:
    result = api_request("GET", f"{API_PROPOSALS_PATH}{proposal_id}")
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response from proposals: {type(result)}")
    return result


def load_evaluation_profile(analysis_id: str) -> Optional[dict]:
    try:
        result = api_request("GET", f"{API_TENDER_CLASSIFICATIONS_PATH}{analysis_id}")
        if isinstance(result, dict):
            return result
    except requests.exceptions.HTTPError as e:
        # Not blocking: proceed without profile
        logger.warning(f"tender-classifications not available for {analysis_id}: {e}")
    return None


# ---------------------------------------------------------------------------
# RAG retrieval (multi-query + dedup)
# ---------------------------------------------------------------------------
def rag_retrieve_economic_chunks(
    qdrant: QdrantClient,
    openai_client: OpenAI,
    slug: str,
    analysis_id: str,
    proposal_id: str,
) -> List[Dict]:
    search_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="category", match=models.MatchValue(value="proposal")),
            models.FieldCondition(key="proposal_id", match=models.MatchValue(value=proposal_id)),
        ]
    )

    dedup: Dict[str, Dict] = {}
    for query in RAG_QUERIES:
        query_vector = get_embedding(openai_client, query)
        result = qdrant.query_points(
            collection_name=slug,
            query=query_vector,
            limit=RAG_TOP_K_PER_QUERY,
            query_filter=search_filter,
        )
        for point in result.points:
            cid = str(point.id)
            if cid in dedup:
                continue
            payload = point.payload or {}
            dedup[cid] = {
                "chunk_id": cid,
                "header": payload.get("Header 1"),
                "chunk_index": payload.get("chunk_index"),
                "text": payload.get("text", ""),
            }
            if len(dedup) >= RAG_MAX_TOTAL_CHUNKS:
                break
        if len(dedup) >= RAG_MAX_TOTAL_CHUNKS:
            break

    return list(dedup.values())


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def build_user_prompt(proposal: dict, profile: Optional[dict], chunks: List[dict]) -> str:
    chunks_text = "\n\n".join(
        f'  [chunk_id={c["chunk_id"]} header="{c["header"] or ""}" chunk_index={c["chunk_index"]}]\n  {c["text"]}'
        for c in chunks
    )
    profile_text = "none"
    if profile:
        profile_text = json.dumps({
            "system_type": profile.get("system_type"),
            "expected_currency": profile.get("expected_currency"),
            "taxes_included_in_offer": profile.get("taxes_included_in_offer"),
            "factors": profile.get("factors"),
        }, ensure_ascii=False)

    return (
        f"Extract the structured economic offer and return a single JSON object.\n\n"
        f"<bidder>\n"
        f"name: {proposal.get('label', '')}\n"
        f"provider: {proposal.get('provider_name', '')}\n"
        f"</bidder>\n\n"
        f"<tender_profile>\n{profile_text}\n</tender_profile>\n\n"
        f"<retrieved_chunks>\n{chunks_text}\n</retrieved_chunks>"
    )


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------
def _call_gemini(gemini: genai.Client, user_prompt: str) -> LLMEconomicOffer:
    response = gemini.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
            genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will return only the JSON economic offer.")]),
            genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
        ],
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=LLMEconomicOffer,
        ),
    )
    return LLMEconomicOffer.model_validate_json(response.text)


def _call_openai(openai_client: OpenAI, user_prompt: str) -> LLMEconomicOffer:
    response = openai_client.chat.completions.create(
        model=OPENAI_FALLBACK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )
    return LLMEconomicOffer.model_validate_json(response.choices[0].message.content)


def call_llm_with_retries(
    gemini: genai.Client,
    openai_client: OpenAI,
    user_prompt: str,
) -> LLMEconomicOffer:
    last_error: Optional[Exception] = None
    for attempt in range(LLM_RETRY_ATTEMPTS + 1):
        try:
            return _call_gemini(gemini, user_prompt)
        except Exception as e_gemini:
            logger.warning(f"attempt {attempt}: Gemini failed ({e_gemini}), trying OpenAI...")
            try:
                return _call_openai(openai_client, user_prompt)
            except Exception as e_openai:
                last_error = e_openai
                logger.warning(f"attempt {attempt}: OpenAI also failed ({e_openai}).")
                if attempt < LLM_RETRY_ATTEMPTS:
                    time.sleep(LLM_RETRY_BACKOFF_BASE ** (attempt + 1))
    raise RuntimeError(f"All LLM attempts exhausted: {last_error}")


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------
def post_process(llm: LLMEconomicOffer) -> LLMEconomicOffer:
    # Normalize currency to uppercase
    if llm.currency:
        llm.currency = llm.currency.strip().upper()
    for item in llm.line_items:
        if item.currency:
            item.currency = item.currency.strip().upper()

    # Sanity check: sum of line_items vs total_amount
    if llm.total_amount is not None and llm.line_items:
        subtotals = [i.subtotal for i in llm.line_items if i.subtotal is not None]
        if subtotals:
            sum_items = sum(subtotals)
            # Allow 1% tolerance; taxes may account for differences otherwise.
            if llm.total_amount > 0:
                diff_ratio = abs(sum_items - llm.total_amount) / llm.total_amount
                if diff_ratio > 0.01 and llm.includes_taxes is None:
                    llm.requires_manual_review = True
                    extra = (
                        f" La suma de line_items ({sum_items}) difiere del total "
                        f"declarado ({llm.total_amount}) en {diff_ratio * 100:.1f}%."
                    )
                    llm.reasoning = (llm.reasoning or "") + extra

    # Degrade: no usable information extracted
    if llm.total_amount is None and not llm.line_items:
        llm.requires_manual_review = True
        if llm.confidence not in ("baja", "muy_baja"):
            llm.confidence = "muy_baja"

    return llm


# ---------------------------------------------------------------------------
# Persist
# ---------------------------------------------------------------------------
def upsert_economic_offer(analysis_id: str, proposal_id: str, llm: LLMEconomicOffer):
    payload = {
        "analysis_id": analysis_id,
        "proposal_id": proposal_id,
        **llm.model_dump(),
        "extracted_by": f"{SERVICE_NAME}@{SERVICE_VERSION}",
    }
    api_request("POST", API_PROPOSAL_ECONOMIC_OFFERS_PATH, payload)
    logger.info(f"Economic offer upserted for proposal {proposal_id}.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_economic_extraction():
    logger.info(f"Starting economic-offer-extractor for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}")

    mark_economic_start(PROPOSAL_ID)

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    try:
        log_event(ANALYSIS_ID, "info", f"Iniciando extraccion economica para propuesta {PROPOSAL_ID}...", EVENT_SOURCE)

        analysis = load_analysis(ANALYSIS_ID)
        slug = analysis["slug"]
        logger.info(f"Target Qdrant collection: {slug}")

        proposal = load_proposal(PROPOSAL_ID)
        profile = load_evaluation_profile(ANALYSIS_ID)

        chunks = rag_retrieve_economic_chunks(
            qdrant, openai_client, slug, ANALYSIS_ID, PROPOSAL_ID,
        )
        logger.info(f"Retrieved {len(chunks)} unique chunks from proposal for economic extraction.")

        if not chunks:
            # No chunks at all -> persist an empty record with manual review flag
            llm = LLMEconomicOffer(
                confidence="muy_baja",
                reasoning="No se encontraron chunks indexados de la propuesta para la extraccion economica.",
                requires_manual_review=True,
            )
        else:
            user_prompt = build_user_prompt(proposal, profile, chunks)
            llm = call_llm_with_retries(gemini_client, openai_client, user_prompt)
            llm = post_process(llm)

        upsert_economic_offer(ANALYSIS_ID, PROPOSAL_ID, llm)
        mark_economic_result(PROPOSAL_ID)

        summary_msg = (
            f"Extraccion economica completada para {proposal.get('label', PROPOSAL_ID)}: "
            f"total={llm.total_amount} {llm.currency or ''} "
            f"items={len(llm.line_items)} "
            f"confidence={llm.confidence} "
            f"manual_review={llm.requires_manual_review}"
        )
        logger.info(summary_msg)
        log_event(ANALYSIS_ID, "info", summary_msg, EVENT_SOURCE, {
            "proposal_id": PROPOSAL_ID,
            "total_amount": str(llm.total_amount) if llm.total_amount is not None else None,
            "currency": llm.currency,
            "line_items_count": len(llm.line_items),
            "confidence": llm.confidence,
            "requires_manual_review": llm.requires_manual_review,
        })

        notify_success()

    except Exception as e:
        mark_economic_failure(PROPOSAL_ID, str(e))
        raise


def main():
    validate_env()
    try:
        process_economic_extraction()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during economic extraction: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during economic extraction: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
