"""
Admissibility Matcher Service
=============================
Given an ANALYSIS_ID and a PROPOSAL_ID, matches each admissibility requirement
(admissibility_requirements) against the proposal's indexed chunks in Qdrant and
writes the verdicts into admissibility_results. Runs for ALL proposals (the
admissibility-gate reads these results to decide admitida/rechazada).

For each requirement, the LLM/auto-filters produce a verdict, but admissibility is
binary (Feature 08): any non-cumple verdict is collapsed to no_cumple before being
persisted to admissibility_results (see append_admissibility_results). Reasoning,
citations, and the manual-verification flag are kept as-is.

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
  - API_ADMISSIBILITY_REQUIREMENTS_PATH
  - API_ADMISSIBILITY_RESULTS_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID        (runtime)
  - PROPOSAL_ID        (runtime)
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Literal, Optional

import requests
from google import genai
from google.genai import types as genai_types
from openai import OpenAI
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.http import models

from supabase_logger import setup_logger, log_event, make_session
from ai_usage_logger import gemini_units, load_pricing, openai_units, record_usage
from prompt_loader import load_prompt

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
API_ADMISSIBILITY_REQUIREMENTS_PATH = os.environ.get("API_ADMISSIBILITY_REQUIREMENTS_PATH")
API_ADMISSIBILITY_RESULTS_PATH = os.environ.get("API_ADMISSIBILITY_RESULTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")

SERVICE_NAME = "service-admissibility-matcher"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_MODEL = "gemini-2.5-flash"
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


RAG_TOP_K = 6
MAX_CONCURRENT_LLM_CALLS = 10
LLM_RETRY_ATTEMPTS = 2
LLM_RETRY_BACKOFF_BASE = 1.5
MAX_LLM_FAILURE_RATIO = 0.20

AUTO_NO_APLICA_ROLES = {"informativo", "desconocido_pendiente_pliego_general", "preferencia_legal"}
AUTO_MANUAL_VERIFICATION_METHODS = {"inspection", "sample", "site_visit"}

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
class ComplianceCitation(BaseModel):
    chunk_id: str
    snippet: str
    header: Optional[str] = None
    chunk_index: Optional[int] = None
    page_number: Optional[int] = None
    filename: Optional[str] = None


class LLMComplianceEntry(BaseModel):
    requirement_id: str
    verdict: Literal["cumple", "cumple_parcial", "no_cumple", "no_evidencia"]
    confidence: Literal["alta", "media", "baja", "muy_baja"] = "media"
    reasoning: str
    missing_elements: List[str] = Field(default_factory=list)
    citations: List[ComplianceCitation] = Field(default_factory=list)
    manual_verification_required: bool = False


class FinalComplianceEntry(BaseModel):
    requirement_id: str
    verdict: Literal[
        "cumple", "cumple_parcial", "no_cumple", "no_evidencia",
        "no_aplica", "requiere_verificacion_manual"
    ]
    confidence: Literal["alta", "media", "baja", "muy_baja"]
    reasoning: Optional[str] = None
    missing_elements: List[str] = Field(default_factory=list)
    citations: List[ComplianceCitation] = Field(default_factory=list)
    manual_verification_required: bool = False
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = None  # loaded at runtime in main() via load_prompt


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
            ("GOOGLE_API_KEY", GOOGLE_API_KEY),
            ("OPENAI_API_KEY", OPENAI_API_KEY),
            ("QDRANT_URL", QDRANT_URL),
            ("QDRANT_API_KEY", QDRANT_API_KEY),
            ("API_BASE_URL", API_BASE_URL),
            ("API_KEY", API_KEY),
            ("API_EVENTS_PATH", API_EVENTS_PATH),
            ("API_ANALYSES_PATH", API_ANALYSES_PATH),
            ("API_PROPOSALS_PATH", API_PROPOSALS_PATH),
            ("API_ADMISSIBILITY_REQUIREMENTS_PATH", API_ADMISSIBILITY_REQUIREMENTS_PATH),
            ("API_ADMISSIBILITY_RESULTS_PATH", API_ADMISSIBILITY_RESULTS_PATH),
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
    response = client.embeddings.create(input=[text], model=EMBEDDING_MODEL)
    in_u, out_u, cached = openai_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "openai", EMBEDDING_MODEL, "embedding",
                 input_units=in_u, output_units=out_u, cached_input_units=cached,
                 pricing=PRICING, proposal_id=PROPOSAL_ID)
    return response.data[0].embedding


# ---------------------------------------------------------------------------
# State transitions (proposals admissibility lifecycle)
# ---------------------------------------------------------------------------
def mark_admissibility_start(proposal_id: str):
    # force=true: in the reordered DAG the matcher runs before the compliance-matcher,
    # so matching_status is still "pending" and the start guard would otherwise reject.
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/admissibility-start", {
        "admissibility_started_at": now,
    }, params={"force": "true"})
    logger.info(f"Proposal {proposal_id} transitioned to evaluating.")


def mark_admissibility_failure(proposal_id: str, error: str):
    try:
        now = datetime.now(timezone.utc).isoformat()
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/admissibility-failure", {
            "admissibility_completed_at": now,
            "admissibility_error": error,
        })
    except Exception as e:
        logger.error(f"Failed to mark admissibility-failure: {e}")


# ---------------------------------------------------------------------------
# Job callbacks
# ---------------------------------------------------------------------------
def notify_success():
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "proposal_id": PROPOSAL_ID,
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
            "proposal_id": PROPOSAL_ID,
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


def load_admissibility_requirements(analysis_id: str) -> List[dict]:
    all_requirements = []
    limit = 100
    offset = 0
    while True:
        result = api_request("GET", f"{API_ADMISSIBILITY_REQUIREMENTS_PATH}{analysis_id}", params={"limit": limit, "offset": offset, "is_verified": "true"})
        if not isinstance(result, list):
            raise RuntimeError(f"Unexpected response from admissibility-requirements: {type(result)}")
        all_requirements.extend(result)
        if len(result) < limit:
            break
        offset += limit
    return all_requirements


# ---------------------------------------------------------------------------
# Auto-filter logic
# ---------------------------------------------------------------------------
def _is_auto_no_aplica(req: dict) -> bool:
    roles = set(req.get("roles", []))
    if not roles:
        return False
    return roles <= AUTO_NO_APLICA_ROLES


def _is_auto_manual(req: dict) -> bool:
    return req.get("verification_method") in AUTO_MANUAL_VERIFICATION_METHODS


def apply_auto_filters(requirements: List[dict]):
    auto_no_aplica: List[FinalComplianceEntry] = []
    auto_manual: List[FinalComplianceEntry] = []
    needs_llm: List[dict] = []

    for req in requirements:
        req_id = str(req["id"])
        if _is_auto_no_aplica(req):
            auto_no_aplica.append(FinalComplianceEntry(
                requirement_id=req_id,
                verdict="no_aplica",
                confidence="alta",
                reasoning="Requisito de rol informativo/preferencia_legal/pendiente; no requiere evaluacion automatica.",
            ))
        elif _is_auto_manual(req):
            auto_manual.append(FinalComplianceEntry(
                requirement_id=req_id,
                verdict="requiere_verificacion_manual",
                confidence="alta",
                reasoning="El metodo de verificacion requiere inspeccion, muestra o visita tecnica por parte de un evaluador humano.",
                manual_verification_required=True,
            ))
        else:
            needs_llm.append(req)

    logger.info(
        f"Auto-filters: {len(auto_no_aplica)} no_aplica, "
        f"{len(auto_manual)} requiere_verificacion_manual, "
        f"{len(needs_llm)} going to LLM."
    )
    return auto_no_aplica, auto_manual, needs_llm


# ---------------------------------------------------------------------------
# RAG search
# ---------------------------------------------------------------------------
def rag_search_proposal_chunks(
    qdrant: QdrantClient,
    openai_client: OpenAI,
    slug: str,
    analysis_id: str,
    proposal_id: str,
    requirement_text: str,
    top_k: int,
) -> List[Dict]:
    """Query the proposal's unified collection PROPOSAL_{slug}_{proposal_id}."""
    query_vector = get_embedding(openai_client, requirement_text)
    collection_name = f"PROPOSAL_{slug}_{proposal_id}"
    result = qdrant.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=top_k,
    )
    chunks = []
    for point in result.points:
        payload = point.payload or {}
        chunks.append({
            "chunk_id": str(point.id),
            "header": payload.get("Header 1"),
            "chunk_index": payload.get("chunk_index"),
            "text": payload.get("text", ""),
            "page_number": payload.get("page_number"),
            "filename": payload.get("filename"),
        })
    return chunks


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def build_user_prompt(proposal: dict, req: dict, chunks: List[dict]) -> str:
    chunks_text = "\n\n".join(
        f'  [chunk_id={c["chunk_id"]} header="{c["header"] or ""}" chunk_index={c["chunk_index"]} page_number={c["page_number"] or ""} filename="{c.get("filename") or ""}"]\n  {c["text"]}'
        for c in chunks
    )
    return (
        f"Evaluate the following requirement against the bidder's proposal chunks and "
        f"return a single JSON object.\n\n"
        f"<bidder>\n"
        f"name: {proposal.get('label', '')}\n"
        f"provider: {proposal.get('provider_name', '')}\n"
        f"</bidder>\n\n"
        f"<requirement>\n"
        f"id:                  {req['id']}\n"
        f"text:                {req['requirement_text']}\n"
        f"domain:              {req.get('domain', '')}\n"
        f"verification_method: {req.get('verification_method', '')}\n"
        f"</requirement>\n\n"
        f"<retrieved_chunks>\n{chunks_text}\n</retrieved_chunks>"
    )


# ---------------------------------------------------------------------------
# LLM calls (sync wrappers, run via asyncio.to_thread)
# ---------------------------------------------------------------------------
def _call_gemini_sync(
    gemini: genai.Client,
    user_prompt: str,
    model: str,
) -> LLMComplianceEntry:
    response = gemini.models.generate_content(
        model=model,
        contents=[
            genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
            genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will return only the JSON compliance entry.")]),
            genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
        ],
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=LLMComplianceEntry,
        ),
    )
    in_u, out_u, cached = gemini_units(response)
    record_usage(ANALYSIS_ID, SERVICE_NAME, "gemini", model, "chat",
                 input_units=in_u, output_units=out_u, cached_input_units=cached,
                 pricing=PRICING, proposal_id=PROPOSAL_ID)
    return LLMComplianceEntry.model_validate_json(response.text)


def _call_openai_sync(
    openai_client: OpenAI,
    user_prompt: str,
    model: str,
) -> LLMComplianceEntry:
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
                 input_units=in_u, output_units=out_u, cached_input_units=cached,
                 pricing=PRICING, proposal_id=PROPOSAL_ID)
    return LLMComplianceEntry.model_validate_json(response.choices[0].message.content)


def _call_llm_sync(
    gemini: genai.Client,
    openai_client: OpenAI,
    user_prompt: str,
    provider: str,
    model: str,
) -> LLMComplianceEntry:
    if provider == "gemini":
        return _call_gemini_sync(gemini, user_prompt, model)
    return _call_openai_sync(openai_client, user_prompt, model)


def post_process_single(
    llm_entry: LLMComplianceEntry,
    req: dict,
    chunks: List[dict],
) -> FinalComplianceEntry:
    manual = llm_entry.manual_verification_required
    if req.get("verification_method") == "external_certificate" and llm_entry.verdict == "cumple":
        manual = True

    chunk_info_map = {c["chunk_id"]: c for c in chunks}
    enriched_citations = []
    for cit in llm_entry.citations:
        info = chunk_info_map.get(cit.chunk_id)
        if info:
            cit.filename = info.get("filename")
            if cit.page_number is None:
                cit.page_number = info.get("page_number")
            if cit.header is None:
                cit.header = info.get("header")
            if cit.chunk_index is None:
                cit.chunk_index = info.get("chunk_index")
        enriched_citations.append(cit)

    return FinalComplianceEntry(
        requirement_id=llm_entry.requirement_id,
        verdict=llm_entry.verdict,
        confidence=llm_entry.confidence,
        reasoning=llm_entry.reasoning,
        missing_elements=llm_entry.missing_elements,
        citations=enriched_citations,
        manual_verification_required=manual,
    )


# ---------------------------------------------------------------------------
# Async evaluation (writes each result to DB immediately)
# ---------------------------------------------------------------------------
async def evaluate_and_persist(
    gemini: genai.Client,
    openai_client: OpenAI,
    proposal: dict,
    req: dict,
    chunks: List[dict],
    semaphore: asyncio.Semaphore,
    analysis_id: str,
    proposal_id: str,
    persist_fn: Callable[[str, str, List[FinalComplianceEntry]], None],
) -> FinalComplianceEntry:
    async with semaphore:
        req_id = str(req["id"])
        user_prompt = build_user_prompt(proposal, req, chunks)
        last_error: Optional[Exception] = None

        for attempt in range(LLM_RETRY_ATTEMPTS + 1):
            try:
                llm_entry = await asyncio.to_thread(_call_llm_sync, gemini, openai_client, user_prompt, PRIMARY_PROVIDER, PRIMARY_MODEL)
                entry = post_process_single(llm_entry, req, chunks)
                await asyncio.to_thread(persist_fn, analysis_id, proposal_id, [entry])
                return entry
            except Exception as e_primary:
                logger.warning(f"req {req_id} attempt {attempt}: primary {PRIMARY_PROVIDER}/{PRIMARY_MODEL} failed ({e_primary}), trying fallback {FALLBACK_PROVIDER}/{FALLBACK_MODEL}...")
                try:
                    llm_entry = await asyncio.to_thread(_call_llm_sync, gemini, openai_client, user_prompt, FALLBACK_PROVIDER, FALLBACK_MODEL)
                    entry = post_process_single(llm_entry, req, chunks)
                    await asyncio.to_thread(persist_fn, analysis_id, proposal_id, [entry])
                    return entry
                except Exception as e_fallback:
                    last_error = e_fallback
                    logger.warning(f"req {req_id} attempt {attempt}: fallback {FALLBACK_PROVIDER}/{FALLBACK_MODEL} also failed ({e_fallback}).")
                    if attempt < LLM_RETRY_ATTEMPTS:
                        backoff = LLM_RETRY_BACKOFF_BASE ** (attempt + 1)
                        await asyncio.sleep(backoff)

        logger.error(f"req {req_id}: all LLM attempts exhausted. Degrading to requiere_verificacion_manual.")
        entry = FinalComplianceEntry(
            requirement_id=req_id,
            verdict="requiere_verificacion_manual",
            confidence="muy_baja",
            reasoning="El modelo LLM no pudo procesar este requisito automaticamente. Requiere evaluacion manual.",
            manual_verification_required=True,
            notes=f"LLM_FAILURE: {last_error}",
        )
        await asyncio.to_thread(persist_fn, analysis_id, proposal_id, [entry])
        return entry


async def run_matching_pass(
    gemini: genai.Client,
    openai_client: OpenAI,
    qdrant: QdrantClient,
    proposal: dict,
    requirements: List[dict],
    slug: str,
    analysis_id: str,
    proposal_id: str,
    persist_fn: Callable[[str, str, List[FinalComplianceEntry]], None],
    label: str,
) -> List[FinalComplianceEntry]:
    """Match a set of requirements against PROPOSAL_{slug}_{proposal_id} and persist verdicts."""
    auto_na, auto_mn, needs_llm = apply_auto_filters(requirements)

    await asyncio.to_thread(persist_fn, analysis_id, proposal_id, auto_na + auto_mn)

    chunks_by_req: Dict[str, List[dict]] = {}
    for req in needs_llm:
        req_id = str(req["id"])
        chunks_by_req[req_id] = rag_search_proposal_chunks(
            qdrant, openai_client, slug,
            analysis_id, proposal_id,
            req["requirement_text"], RAG_TOP_K,
        )

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS)
    coros = [
        evaluate_and_persist(
            gemini, openai_client, proposal,
            req, chunks_by_req[str(req["id"])], semaphore,
            analysis_id, proposal_id, persist_fn,
        )
        for req in needs_llm
    ]
    llm_entries: List[FinalComplianceEntry] = await asyncio.gather(*coros)

    failure_count = sum(
        1 for e in llm_entries
        if e.notes and e.notes.startswith("LLM_FAILURE")
    )
    if needs_llm and (failure_count / len(needs_llm)) > MAX_LLM_FAILURE_RATIO:
        raise RuntimeError(
            f"{label}: LLM failure ratio exceeded threshold: {failure_count}/{len(needs_llm)} "
            f"({100 * failure_count // len(needs_llm)}% > {int(MAX_LLM_FAILURE_RATIO * 100)}%)"
        )

    all_entries = list(auto_na) + list(auto_mn) + list(llm_entries)
    logger.info(
        f"{label}: {len(all_entries)} entries | no_aplica: {len(auto_na)} | "
        f"manual: {len(auto_mn)} | llm: {len(llm_entries)} (fallos: {failure_count})"
    )
    return all_entries


# ---------------------------------------------------------------------------
# Persist (incremental)
# ---------------------------------------------------------------------------
def delete_admissibility_results_for_proposal(proposal_id: str):
    api_request("DELETE", f"{API_ADMISSIBILITY_RESULTS_PATH}by-proposal/{proposal_id}")
    logger.info(f"Deleted existing admissibility results for proposal {proposal_id}.")


def append_admissibility_results(analysis_id: str, proposal_id: str, entries: List[FinalComplianceEntry]):
    # APPEND (does NOT replace): the proposal's prior rows are cleared once up front via
    # delete_admissibility_results_for_proposal, then rows are appended as each requirement
    # is processed. Using /bulk here would replace on every call and keep only the last entry.
    if not entries:
        return
    # Feature 08: admissibility verdict is binary. Collapse any non-cumple verdict
    # (cumple_parcial, no_evidencia, no_aplica, requiere_verificacion_manual) to
    # no_cumple before persisting. Single defensive chokepoint covering every entry
    # source (auto-filters, LLM, degrade). manual_verification_required is kept as-is.
    payload = [
        {
            "analysis_id": analysis_id,
            "proposal_id": proposal_id,
            **e.model_dump(),
            "verdict": "cumple" if e.verdict == "cumple" else "no_cumple",
        }
        for e in entries
    ]
    api_request("POST", f"{API_ADMISSIBILITY_RESULTS_PATH}batch", payload)
    logger.info(f"POST admissibility results batch: {len(entries)} entries appended.")


# ---------------------------------------------------------------------------
# Main async flow
# ---------------------------------------------------------------------------
async def process_admissibility_matching_async():
    logger.info(f"Starting admissibility-matcher for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}")

    mark_admissibility_start(PROPOSAL_ID)

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    try:
        log_event(ANALYSIS_ID, "info", f"Iniciando match de admisibilidad para propuesta {PROPOSAL_ID}...", EVENT_SOURCE)

        analysis = load_analysis(ANALYSIS_ID)
        slug = analysis["slug"]
        logger.info(f"Target Qdrant collection slug: {slug}")

        proposal = load_proposal(PROPOSAL_ID)

        admissibility_requirements = load_admissibility_requirements(ANALYSIS_ID)
        logger.info(f"Loaded {len(admissibility_requirements)} verified admissibility requirements.")
        log_event(
            ANALYSIS_ID, "info",
            f"Evaluando {len(admissibility_requirements)} requisitos de admisibilidad contra propuesta {proposal.get('label', PROPOSAL_ID)}...",
            EVENT_SOURCE,
        )

        # Clear the proposal's prior results ONCE; rows are then appended incrementally as
        # each requirement is matched (see append_admissibility_results).
        delete_admissibility_results_for_proposal(PROPOSAL_ID)
        admissibility_entries = await run_matching_pass(
            gemini_client, openai_client, qdrant,
            proposal, admissibility_requirements, slug,
            ANALYSIS_ID, PROPOSAL_ID,
            append_admissibility_results,
            label="admissibility_requirements",
        )

        summary = f"Match de admisibilidad completado: {len(admissibility_entries)} entradas de admisibilidad"
        logger.info(summary)
        log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE, {
            "proposal_id": PROPOSAL_ID,
            "admissibility_entries": len(admissibility_entries),
        })

        # Leave admissibility_status in "evaluating"; the admissibility-gate decides the
        # terminal admitida/rechazada after matching completes for all proposals.
        notify_success()

    except Exception as e:
        mark_admissibility_failure(PROPOSAL_ID, str(e))
        raise


def main():
    global PRICING, SYSTEM_PROMPT
    validate_env()
    SYSTEM_PROMPT = load_prompt("service-admissibility-matcher/compliance_evaluator")
    resolve_model_config()
    PRICING = load_pricing()
    try:
        asyncio.run(process_admissibility_matching_async())
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during admissibility matching: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during admissibility matching: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
