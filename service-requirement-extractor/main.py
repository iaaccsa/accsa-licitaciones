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
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Annotated, Dict, List, Literal, Optional, Tuple, Union

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
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_TENDER_CLASSIFICATIONS_PATH = os.environ.get("API_TENDER_CLASSIFICATIONS_PATH")
API_ANALYSIS_REQUIREMENTS_PATH = os.environ.get("API_ANALYSIS_REQUIREMENTS_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

SERVICE_NAME = "service-requirement-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
GEMINI_MODEL = "gemini-2.5-flash"
OPENAI_FALLBACK_MODEL = "gpt-4.1-nano"
BATCH_SIZE = 15
BATCH_OVERLAP = 2
MAX_PARALLEL_BATCHES = 3
SCROLL_PAGE_SIZE = 256
MAX_FAILED_BATCH_RATIO = 0.20

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
# Data Models
# ---------------------------------------------------------------------------
CONFIDENCE_ORDER = {"alta": 3, "media": 2, "baja": 1, "muy_baja": 0}


class MappedFactor(BaseModel):
    factor_id: str
    weight_type: Literal["points", "percent", "formula", "none"]
    weight_value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None


class RequirementWeight(BaseModel):
    type: Literal["points", "percent", "formula", "none"] = "none"
    value: Optional[float] = None
    formula: Optional[str] = None
    block: Optional[Literal["cualitativo", "cuantitativo"]] = None


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


class BatchResponse(BaseModel):
    requirements: List[RawRequirement]


class FinalRequirement(RawRequirement):
    requirement_code: str
    is_admissibility: bool = False


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (Path(__file__).parent / "prompt_requirements_extractor.md").read_text(encoding="utf-8")

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
        api_request("PATCH", f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status", {"status": "ready", "is_success": False})
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
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
# Profile
# ---------------------------------------------------------------------------
def get_evaluation_profile(analysis_id: str) -> dict:
    profile = api_request("GET", f"{API_TENDER_CLASSIFICATIONS_PATH}{analysis_id}")
    if not isinstance(profile, dict):
        raise RuntimeError(f"Unexpected response type from tender-classifications: {type(profile)}")
    profile_version = profile.get("profile_version")
    if profile_version is not None and profile_version != 2:
        raise RuntimeError(
            f"evaluation_profile version mismatch: expected 2, got {profile_version}. "
            "Re-run service-tender-classifier for this analysis before extracting requirements."
        )
    if profile_version is None:
        logger.warning("profile_version field not present in tender-classifications response; proceeding anyway.")
    if not profile.get("enabled_roles"):
        raise RuntimeError("evaluation_profile has no enabled_roles. Cannot extract requirements without a valid profile.")
    logger.info(f"Loaded evaluation profile: system_type={profile.get('system_type')}, factors={len(profile.get('factors', []))}")
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
        raise RuntimeError(f"Unexpected response from processed-files search: {type(tender_files)}")

    tender_files.sort(key=lambda f: (f.get("file_name") or ""))
    logger.info(f"Found {len(tender_files)} tender files.")

    chunks: List[dict] = []
    for file_order, f in enumerate(tender_files):
        file_id = f["id"]
        file_name = f.get("file_name") or ""
        collection_name = f"FILE_{slug}_{file_id}"

        if not qdrant.collection_exists(collection_name):
            logger.warning(f"Collection '{collection_name}' missing; skipping file '{file_name}'.")
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
                chunks.append({
                    "chunk_id": str(point.id),
                    "file_order": file_order,
                    "chunk_index": int(payload["chunk_index"]),
                    "text": payload.get("text", ""),
                    "page_number": payload.get("page_number"),
                    "filename": payload.get("filename") or file_name,
                    "file_id": file_id,
                })
                file_chunk_count += 1
            offset = next_offset
            if offset is None:
                break
        logger.info(f"  '{file_name}': {file_chunk_count} chunks from '{collection_name}'.")

    chunks.sort(key=lambda c: (c["file_order"], c["chunk_index"]))
    logger.info(f"Fetched {len(chunks)} total tender chunks across {len(tender_files)} files.")
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
        batches.append(chunks[start: start + size])
        start += step
    return batches


# ---------------------------------------------------------------------------
# LLM extraction
# ---------------------------------------------------------------------------
def build_user_prompt(profile: dict, batch: List[dict]) -> str:
    profile_json = json.dumps(profile, ensure_ascii=False, indent=2)
    chunks_text = "\n\n".join(
        f'[chunk_id={c["chunk_id"]} page_number={c["page_number"] or ""} filename={c.get("filename") or ""}]'
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


def extract_batch(
    gemini_client: genai.Client,
    openai_client: OpenAI,
    profile: dict,
    batch: List[dict],
    batch_id: int,
) -> List[RawRequirement]:
    user_prompt = build_user_prompt(profile, batch)

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                genai_types.Content(role="user", parts=[genai_types.Part(text=SYSTEM_PROMPT)]),
                genai_types.Content(role="model", parts=[genai_types.Part(text="Understood. I will return only a JSON object with the requirements list.")]),
                genai_types.Content(role="user", parts=[genai_types.Part(text=user_prompt)]),
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BatchResponse,
            ),
        )
        result = BatchResponse.model_validate_json(response.text)
    except Exception as gemini_err:
        logger.warning(f"Batch {batch_id}: Gemini failed ({gemini_err}), falling back to OpenAI...")
        try:
            oai_response = openai_client.chat.completions.create(
                model=OPENAI_FALLBACK_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
            )
            result = BatchResponse.model_validate_json(oai_response.choices[0].message.content)
        except Exception as oai_err:
            logger.error(f"Batch {batch_id}: OpenAI also failed ({oai_err}). Skipping batch.")
            return []

    for req in result.requirements:
        req.extraction_batch_id = batch_id
    logger.info(f"Batch {batch_id}: extracted {len(result.requirements)} requirements.")
    return result.requirements


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
        req_summary = next((r.requirement_summary for r in group if r.requirement_summary), None)

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

        merged.append(RawRequirement(
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
        ))

    return merged


# ---------------------------------------------------------------------------
# Code assignment
# ---------------------------------------------------------------------------
def assign_codes(reqs: List[RawRequirement], chunk_index_map: Dict[str, int]) -> List[FinalRequirement]:
    def first_position(req: RawRequirement) -> int:
        positions = [chunk_index_map.get(c.chunk_id, 999999) for c in req.citations]
        return min(positions) if positions else 999999

    sorted_reqs = sorted(reqs, key=first_position)
    result = []
    for i, req in enumerate(sorted_reqs, start=1):
        result.append(FinalRequirement(
            **req.model_dump(),
            requirement_code=f"REQ-{i:03d}",
        ))
    return result


# ---------------------------------------------------------------------------
# Profile validation
# ---------------------------------------------------------------------------
def validate_against_profile(
    reqs: List[FinalRequirement],
    profile: dict,
) -> Tuple[List[FinalRequirement], List[str]]:
    enabled_roles = profile.get("enabled_roles", {})
    enabled_role_ids = {r for r, v in enabled_roles.items() if isinstance(v, dict) and v.get("enabled")}
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
        valid_factors = [mf for mf in req.mapped_factors if mf.factor_id in valid_factor_ids]
        invalid_fids = [mf.factor_id for mf in req.mapped_factors if mf.factor_id not in valid_factor_ids]
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
                    if "informativo" not in valid_roles and "informativo" in enabled_role_ids:
                        valid_roles.append("informativo")

        if not valid_roles:
            warnings.append(f"{req.requirement_code}: no valid roles remain after validation. Discarded.")
            continue

        cleaned.append(FinalRequirement(
            **{**req.model_dump(), "roles": valid_roles, "mapped_factors": valid_factors},
        ))

    # Strategy-level cross-requirement checks
    if system_type == "solo_precio_con_AN":
        has_an_penalizador = any(
            "penalizador" in r.roles and any(mf.factor_id == "antecedentes_negativos" for mf in r.mapped_factors)
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
    api_request("POST", f"{API_ANALYSIS_REQUIREMENTS_PATH}bulk", payload, params={"analysis_id": analysis_id})
    logger.info(f"POST bulk: {len(reqs)} requirements saved.")


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def process_extraction():
    logger.info(f"Starting requirement-extractor for ANALYSIS_ID={ANALYSIS_ID}")

    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    log_event(ANALYSIS_ID, "info", "Iniciando extracción de requerimientos con clasificación multi-eje...", EVENT_SOURCE)

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
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    chunk_index_map = {c["chunk_id"]: c["chunk_index"] for c in chunks}
    chunk_info_map = {c["chunk_id"]: c for c in chunks}

    # 4. Build batches
    batches = make_batches(chunks, BATCH_SIZE, BATCH_OVERLAP)
    logger.info(f"Processing {len(chunks)} chunks in {len(batches)} batches (size={BATCH_SIZE}, overlap={BATCH_OVERLAP}).")
    log_event(ANALYSIS_ID, "info", f"Procesando {len(chunks)} chunks en {len(batches)} batches...", EVENT_SOURCE)

    # 5. Parallel batch extraction
    raw_results: List[RawRequirement] = []
    failed_batches = 0

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_BATCHES) as executor:
        futures = {
            executor.submit(extract_batch, gemini_client, openai_client, profile, batch, batch_id): batch_id
            for batch_id, batch in enumerate(batches, start=1)
        }
        for future in as_completed(futures):
            batch_id = futures[future]
            try:
                result = future.result()
                if not result:
                    failed_batches += 1
                else:
                    raw_results.extend(result)
            except Exception as e:
                logger.error(f"Batch {batch_id} raised unexpected exception: {e}")
                failed_batches += 1

    logger.info(f"Extraction complete: {len(raw_results)} raw requirements, {failed_batches}/{len(batches)} batches failed.")

    if len(batches) > 0 and (failed_batches / len(batches)) > MAX_FAILED_BATCH_RATIO:
        raise RuntimeError(
            f"Too many failed batches: {failed_batches}/{len(batches)} "
            f"({100 * failed_batches // len(batches)}% > {int(MAX_FAILED_BATCH_RATIO * 100)}% threshold). "
            "Aborting to avoid incomplete results."
        )

    if not raw_results:
        msg = "No requirements extracted from any batch."
        logger.warning(msg)
        log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
        return

    # 6. Deduplicate
    deduped = deduplicate(raw_results)
    logger.info(f"After deduplication: {len(deduped)} requirements (from {len(raw_results)} raw).")

    # 7. Assign codes
    with_codes = assign_codes(deduped, chunk_index_map)

    # 8. Validate against profile
    cleaned, validation_warnings = validate_against_profile(with_codes, profile)
    for w in validation_warnings:
        logger.warning(f"profile_validation: {w}")
        log_event(ANALYSIS_ID, "warning", w, EVENT_SOURCE)

    logger.info(f"After validation: {len(cleaned)} requirements remain ({len(with_codes) - len(cleaned)} discarded).")

    # 8b. Calculate is_admissibility
    admissibility_count = 0
    for req in cleaned:
        req.is_admissibility = (
            "admisibilidad_obligatoria" in req.roles
            and req.verification_method == "auto_verifiable_from_offer"
        )
        if req.is_admissibility:
            admissibility_count += 1
    logger.info(f"Admissibility requirements flagged: {admissibility_count}/{len(cleaned)}.")

    # 8c. Enrich citations with canonical filename + page_number from Qdrant
    for req in cleaned:
        for cit in req.citations:
            info = chunk_info_map.get(cit.chunk_id)
            if info:
                cit.filename = info.get("filename")
                if cit.page_number is None:
                    cit.page_number = info.get("page_number")

    # 9. Post bulk
    post_bulk(ANALYSIS_ID, cleaned)

    # 10. Summary + notify success
    domain_counts: Dict[str, int] = {}
    role_counts: Dict[str, int] = {}
    for r in cleaned:
        domain_counts[r.domain] = domain_counts.get(r.domain, 0) + 1
        for role in r.roles:
            role_counts[role] = role_counts.get(role, 0) + 1

    summary = (
        f"Extraccion completada: {len(cleaned)} requerimientos | "
        f"batches fallidos: {failed_batches}/{len(batches)} | "
        f"warnings de validacion: {len(validation_warnings)}"
    )
    logger.info(summary)
    log_event(ANALYSIS_ID, "info", summary, EVENT_SOURCE, {
        "requirement_count": len(cleaned),
        "raw_count": len(raw_results),
        "batch_count": len(batches),
        "failed_batches": failed_batches,
        "validation_warnings": len(validation_warnings),
        "domain_distribution": domain_counts,
        "role_distribution": role_counts,
    })

    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "status": "success",
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback on success: {e}")


def main():
    validate_env()
    try:
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
