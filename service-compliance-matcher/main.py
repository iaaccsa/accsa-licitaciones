"""
Compliance Matcher Service
==========================
Given an ANALYSIS_ID and a PROPOSAL_ID, builds the compliance matrix
(analysis_compliance_matrix) between each requirement of the pliego and the
proposal's indexed chunks in Qdrant.

For each requirement, produces a verdict (cumple / cumple_parcial / no_cumple /
no_evidencia / no_aplica / requiere_verificacion_manual) with reasoning,
citations, and a manual-verification flag when applicable.

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
  - API_ANALYSIS_REQUIREMENTS_PATH
  - API_TENDER_CLASSIFICATIONS_PATH
  - API_COMPLIANCE_MATRIX_PATH
  - API_JOBS_CALLBACK
  - ANALYSIS_ID        (runtime)
  - PROPOSAL_ID        (runtime)
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

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
API_ANALYSIS_REQUIREMENTS_PATH = os.environ.get("API_ANALYSIS_REQUIREMENTS_PATH")
API_TENDER_CLASSIFICATIONS_PATH = os.environ.get("API_TENDER_CLASSIFICATIONS_PATH")
API_COMPLIANCE_MATRIX_PATH = os.environ.get("API_COMPLIANCE_MATRIX_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
PROPOSAL_ID = os.environ.get("PROPOSAL_ID")

SERVICE_NAME = "service-compliance-matcher"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_MODEL = "gemini-2.5-flash"
OPENAI_FALLBACK_MODEL = "gpt-4.1-mini"

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
SYSTEM_PROMPT = """You are a compliance evaluator for Uruguayan public procurement. Your job is
to decide whether a SINGLE requirement from a "pliego de licitación" is
satisfied by a specific bidder's proposal, based on chunks retrieved from
that proposal.

You will receive exactly one requirement with:
  - requirement_id (use it verbatim in your output)
  - requirement_text (the atomic obligation)
  - domain (the thematic domain)
  - verification_method (how it will ultimately be verified)
  - retrieved_chunks: chunks from the bidder's proposal that may contain
    relevant information. Each chunk includes chunk_id, header, chunk_index,
    page_number and text.

### Verdicts

Pick EXACTLY ONE verdict:

- cumple          -> explicit and sufficient evidence that the proposal satisfies it.
- cumple_parcial  -> the proposal covers part of it; some specific element is missing.
                     You MUST list the missing elements in `missing_elements`.
- no_cumple       -> explicit evidence of non-compliance or of something that
                     contradicts the requirement (e.g. offered value is outside
                     the allowed range, wrong material, longer deadline).
- no_evidencia    -> the retrieved chunks do not talk about the topic at all,
                     neither confirming nor denying it.

NOTE: Do NOT use `no_aplica` or `requiere_verificacion_manual`. Those cases
are handled outside the LLM. Do NOT set `manual_verification_required = true`
unless specifically instructed below for external_certificate cases.

### Special case: verification_method = external_certificate

When the requirement has verification_method = "external_certificate", the
proposal cannot truly prove compliance — only the external registry can. But
you should check whether the proposal DECLARES that it attaches or references
the certificate:

- If the proposal explicitly mentions attaching, providing, or holding the
  certificate -> verdict = "cumple" AND "manual_verification_required" = true.
- If the proposal does not mention the certificate at all -> verdict = "no_evidencia".
- If the proposal explicitly says it does NOT have the certificate -> verdict = "no_cumple".

### Reasoning and citations

- `reasoning`: 2-4 short sentences in Spanish explaining WHY you chose the verdict.
  Cite concrete details from the chunks (specific values, phrases, sections).
- `citations`: list of citations pointing to the chunks that support your verdict.
  Every citation must use the `chunk_id` EXACTLY as provided in the input.
  Include at most 3 citations and pick the most relevant ones.
  Each citation has: chunk_id, snippet (literal quote, <= 300 chars), header, chunk_index, page_number.

### Confidence

- alta     -> clear and unambiguous
- media    -> reasonable but some ambiguity
- baja     -> inferred from weak signals
- muy_baja -> very unclear; flag for human review

### Output format (ONLY this JSON object, no wrapper)

{
  "requirement_id": "8f3e1b7c-...",
  "verdict": "cumple_parcial",
  "confidence": "alta",
  "reasoning": "La propuesta ofrece proteccion magnetotermica pero de 20 A en lugar de los 16 A exigidos. El oferente reconoce explicitamente la diferencia.",
  "missing_elements": [
    "el interruptor magnetotermico debe ser de 16 amperios, no de 20"
  ],
  "citations": [
    {
      "chunk_id": "qdrant_point_xyz789",
      "snippet": "Se proveerá un interruptor magnetotérmico unipolar + neutro de 20 Amperios... (Nota: El pliego exige 16 Amperios).",
      "header": "DETALLE TECNICO DE LA OFERTA",
      "chunk_index": 2,
      "page_number": 5
    }
  ],
  "manual_verification_required": false
}

### Hard rules (will be validated)

1. `requirement_id` in the output MUST match the one in the input exactly.
2. `chunk_id` values in citations MUST come from the `retrieved_chunks` of the input.
3. `missing_elements` must be empty unless verdict == "cumple_parcial".
4. `manual_verification_required` must be false unless the requirement is
   verification_method=external_certificate AND the verdict is "cumple".
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
            ("API_ANALYSIS_REQUIREMENTS_PATH", API_ANALYSIS_REQUIREMENTS_PATH),
            ("API_TENDER_CLASSIFICATIONS_PATH", API_TENDER_CLASSIFICATIONS_PATH),
            ("API_COMPLIANCE_MATRIX_PATH", API_COMPLIANCE_MATRIX_PATH),
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
def mark_matching_start(proposal_id: str):
    try:
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/matching-start", {})
        logger.info(f"Proposal {proposal_id} transitioned to matching.")
    except Exception as e:
        logger.error(f"Failed to mark matching-start: {e}")
        raise


def mark_matching_result(proposal_id: str):
    now = datetime.now(timezone.utc).isoformat()
    api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/matching-result", {
        "matching_completed_at": now,
    })
    logger.info(f"Proposal {proposal_id} transitioned to matrix_ready.")


def mark_matching_failure(proposal_id: str, error: str):
    try:
        api_request("PATCH", f"{API_PROPOSALS_PATH}{proposal_id}/matching-failure", {
            "error_message": error,
        })
    except Exception as e:
        logger.error(f"Failed to mark matching-failure: {e}")


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


def load_requirements(analysis_id: str) -> List[dict]:
    all_requirements = []
    limit = 100
    offset = 0
    while True:
        result = api_request("GET", f"{API_ANALYSIS_REQUIREMENTS_PATH}{analysis_id}", params={"limit": limit, "offset": offset, "is_verified": "true"})
        if not isinstance(result, list):
            raise RuntimeError(f"Unexpected response from analysis-requirements: {type(result)}")
        all_requirements.extend(result)
        if len(result) < limit:
            break
        offset += limit
    return all_requirements


def load_evaluation_profile(analysis_id: str) -> dict:
    result = api_request("GET", f"{API_TENDER_CLASSIFICATIONS_PATH}{analysis_id}")
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected response from tender-classifications: {type(result)}")
    return result


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
                reasoning="Requerimiento de rol informativo/preferencia_legal/pendiente; no requiere evaluacion automatica.",
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
    query_vector = get_embedding(openai_client, requirement_text)
    search_filter = models.Filter(
        must=[
            models.FieldCondition(key="analysis_id", match=models.MatchValue(value=analysis_id)),
            models.FieldCondition(key="category", match=models.MatchValue(value="proposal")),
            models.FieldCondition(key="proposal_id", match=models.MatchValue(value=proposal_id)),
        ]
    )
    result = qdrant.query_points(
        collection_name=slug,
        query=query_vector,
        limit=top_k,
        query_filter=search_filter,
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
        })
    return chunks


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def build_user_prompt(proposal: dict, req: dict, chunks: List[dict]) -> str:
    chunks_text = "\n\n".join(
        f'  [chunk_id={c["chunk_id"]} header="{c["header"] or ""}" chunk_index={c["chunk_index"]} page_number={c["page_number"] or ""}]\n  {c["text"]}'
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
) -> LLMComplianceEntry:
    response = gemini.models.generate_content(
        model=GEMINI_MODEL,
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
    return LLMComplianceEntry.model_validate_json(response.text)


def _call_openai_sync(
    openai_client: OpenAI,
    user_prompt: str,
) -> LLMComplianceEntry:
    response = openai_client.chat.completions.create(
        model=OPENAI_FALLBACK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )
    return LLMComplianceEntry.model_validate_json(response.choices[0].message.content)


def post_process_single(llm_entry: LLMComplianceEntry, req: dict) -> FinalComplianceEntry:
    manual = llm_entry.manual_verification_required
    if req.get("verification_method") == "external_certificate" and llm_entry.verdict == "cumple":
        manual = True
    return FinalComplianceEntry(
        requirement_id=llm_entry.requirement_id,
        verdict=llm_entry.verdict,
        confidence=llm_entry.confidence,
        reasoning=llm_entry.reasoning,
        missing_elements=llm_entry.missing_elements,
        citations=llm_entry.citations,
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
) -> FinalComplianceEntry:
    async with semaphore:
        req_id = str(req["id"])
        user_prompt = build_user_prompt(proposal, req, chunks)
        last_error: Optional[Exception] = None

        for attempt in range(LLM_RETRY_ATTEMPTS + 1):
            try:
                llm_entry = await asyncio.to_thread(_call_gemini_sync, gemini, user_prompt)
                entry = post_process_single(llm_entry, req)
                await asyncio.to_thread(post_matrix_entries, analysis_id, proposal_id, [entry])
                return entry
            except Exception as e_gemini:
                logger.warning(f"req {req_id} attempt {attempt}: Gemini failed ({e_gemini}), trying OpenAI...")
                try:
                    llm_entry = await asyncio.to_thread(_call_openai_sync, openai_client, user_prompt)
                    entry = post_process_single(llm_entry, req)
                    await asyncio.to_thread(post_matrix_entries, analysis_id, proposal_id, [entry])
                    return entry
                except Exception as e_openai:
                    last_error = e_openai
                    logger.warning(f"req {req_id} attempt {attempt}: OpenAI also failed ({e_openai}).")
                    if attempt < LLM_RETRY_ATTEMPTS:
                        backoff = LLM_RETRY_BACKOFF_BASE ** (attempt + 1)
                        await asyncio.sleep(backoff)

        logger.error(f"req {req_id}: all LLM attempts exhausted. Degrading to requiere_verificacion_manual.")
        entry = FinalComplianceEntry(
            requirement_id=req_id,
            verdict="requiere_verificacion_manual",
            confidence="muy_baja",
            reasoning="El modelo LLM no pudo procesar este requerimiento automaticamente. Requiere evaluacion manual.",
            manual_verification_required=True,
            notes=f"LLM_FAILURE: {last_error}",
        )
        await asyncio.to_thread(post_matrix_entries, analysis_id, proposal_id, [entry])
        return entry


# ---------------------------------------------------------------------------
# Persist (incremental)
# ---------------------------------------------------------------------------
def delete_matrix_for_proposal(proposal_id: str):
    api_request("DELETE", f"{API_COMPLIANCE_MATRIX_PATH}by-proposal/{proposal_id}")
    logger.info(f"Deleted existing matrix entries for proposal {proposal_id}.")


def post_matrix_entries(analysis_id: str, proposal_id: str, entries: List[FinalComplianceEntry]):
    if not entries:
        return
    payload = [
        {
            "analysis_id": analysis_id,
            "proposal_id": proposal_id,
            **e.model_dump(),
        }
        for e in entries
    ]
    api_request("POST", f"{API_COMPLIANCE_MATRIX_PATH}batch", payload)
    logger.info(f"POST matrix batch: {len(entries)} entries saved.")


# ---------------------------------------------------------------------------
# Main async flow
# ---------------------------------------------------------------------------
async def process_compliance_matching_async():
    logger.info(f"Starting compliance-matcher for ANALYSIS_ID={ANALYSIS_ID} PROPOSAL_ID={PROPOSAL_ID}")

    mark_matching_start(PROPOSAL_ID)

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)

    try:
        log_event(ANALYSIS_ID, "info", f"Iniciando compliance matching para propuesta {PROPOSAL_ID}...", EVENT_SOURCE)

        analysis = load_analysis(ANALYSIS_ID)
        slug = analysis["slug"]
        logger.info(f"Target Qdrant collection: {slug}")

        proposal = load_proposal(PROPOSAL_ID)
        requirements = load_requirements(ANALYSIS_ID)

        if not requirements:
            msg = "No se encontraron requerimientos verificados (is_verified=true). Verificar que los requerimientos hayan sido validados antes de iniciar el matching."
            log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
            mark_failed(ANALYSIS_ID, msg, EVENT_SOURCE)
            raise RuntimeError(msg)

        _profile = load_evaluation_profile(ANALYSIS_ID)  # context, not blocking

        logger.info(f"Loaded {len(requirements)} requirements.")
        log_event(ANALYSIS_ID, "info", f"Evaluando {len(requirements)} requerimientos contra propuesta {proposal.get('label', PROPOSAL_ID)}...", EVENT_SOURCE)

        auto_na, auto_mn, needs_llm = apply_auto_filters(requirements)

        # Delete existing matrix entries for this proposal
        delete_matrix_for_proposal(PROPOSAL_ID)

        # Write auto-filtered entries immediately
        post_matrix_entries(ANALYSIS_ID, PROPOSAL_ID, auto_na + auto_mn)

        # RAG search per requirement (synchronous, not the bottleneck)
        chunks_by_req: Dict[str, List[dict]] = {}
        for req in needs_llm:
            req_id = str(req["id"])
            chunks_by_req[req_id] = rag_search_proposal_chunks(
                qdrant, openai_client, slug,
                ANALYSIS_ID, PROPOSAL_ID,
                req["requirement_text"], RAG_TOP_K,
            )

        # Parallel LLM evaluation with semaphore — each result is persisted immediately
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS)
        coros = [
            evaluate_and_persist(
                gemini_client, openai_client, proposal,
                req, chunks_by_req[str(req["id"])], semaphore,
                ANALYSIS_ID, PROPOSAL_ID,
            )
            for req in needs_llm
        ]
        llm_entries: List[FinalComplianceEntry] = await asyncio.gather(*coros)

        # Check global failure ratio
        failure_count = sum(
            1 for e in llm_entries
            if e.notes and e.notes.startswith("LLM_FAILURE")
        )
        if needs_llm and (failure_count / len(needs_llm)) > MAX_LLM_FAILURE_RATIO:
            raise RuntimeError(
                f"LLM failure ratio exceeded threshold: {failure_count}/{len(needs_llm)} "
                f"({100 * failure_count // len(needs_llm)}% > {int(MAX_LLM_FAILURE_RATIO * 100)}%)"
            )

        all_entries = list(auto_na) + list(auto_mn) + list(llm_entries)
        mark_matching_result(PROPOSAL_ID)

        summary = (
            f"Compliance matching completado: {len(all_entries)} entradas | "
            f"no_aplica: {len(auto_na)} | manual: {len(auto_mn)} | "
            f"llm: {len(llm_entries)} (fallos: {failure_count})"
        )
        logger.info(summary)
        log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE, {
            "proposal_id": PROPOSAL_ID,
            "total_entries": len(all_entries),
            "auto_no_aplica": len(auto_na),
            "auto_manual": len(auto_mn),
            "llm_evaluated": len(llm_entries),
            "llm_failures": failure_count,
        })

        notify_success()

    except Exception as e:
        mark_matching_failure(PROPOSAL_ID, str(e))
        raise


def main():
    validate_env()
    try:
        asyncio.run(process_compliance_matching_async())
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP Error during compliance matching: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" - Response: {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed during compliance matching: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
