# service-documents-grouper — Performance Enhancement

Status: **Spec only, not implemented.** This document captures the diagnosis of
why `service-documents-grouper` is slow at the end of its run and two concrete
implementation approaches with full code-level detail for later execution.

---

## 1. Context / Problem

`service-documents-grouper` runs late in the pipeline (after
`documents-classifier`, before `tender-classifier` / `build-proposal-index`).
Observed symptom: the service takes a long time **at the end** of its run.

The service does only 2 LLM calls (grouping + tender naming), which are fast and
are NOT the bottleneck. The slowness is the **final file-linking phase**: after
the LLM groups files, the service writes `proposal_id` / `tender_id` back to every
file, one HTTP request per file, sequentially.

---

## 2. Service flow (current)

Entry: `accsa-licitaciones-services/service-documents-grouper/main.py`

`main()` -> `process_documents_grouping()` (lines 408-454):

1. `cleanup_previous_run()` — `DELETE proposals/by-analysis`, `DELETE tenders/by-analysis` (lines 383-405)
2. Fetch all files: `POST /api/v1/processed-files/search` (line 415) — single call, OK
3. Init Gemini + OpenAI clients (lines 434-435)
4. `create_proposals_and_update_files()` (line 438) — **LLM call + N+1 PATCH loop**
5. `generate_tender_info()` (line 441) — LLM call + 1 PATCH analysis
6. `create_tender_and_update_files()` (line 445) — **N+1 PATCH loop**
7. `POST /api/v1/jobs/callback` (line 450) — single call, OK

HTTP layer: `SESSION = make_session()` (main.py:56), from
`global/supabase_logger.py`. Each `api_request()` (main.py:67-76) uses
`timeout=30`. Session retry: `total=3, backoff_factor=2`, status_forcelist
429/500/502/503/504 (`supabase_logger.py:31-37`) -> up to 2s/4s/8s extra wait
per failing request. **Synchronous, single-threaded `requests`. No async, no
threads** (`requirements.txt`: only `google-genai`, `openai`, `requests`).

---

## 3. Root cause — the N+1 at the end

### Phase A — proposal linking (`main.py:204-239`)

For each proposal group:
- `POST /api/v1/proposals/` (create proposal)
- For **each file** in the group:
  - `PATCH /api/v1/processed-files/{file_id}` `{proposal_id}` (line 225)
  - if `original_file_id` exists: `PATCH /api/v1/original-files/{link_id}` `{proposal_id}` (line 233)

```python
# main.py:223-235
for file_id in file_ids:
    api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{file_id}", {
                "proposal_id": proposal_id})
    file_record = file_lookup.get(file_id)
    link_id = file_record.get("original_file_id") if file_record else None
    if link_id:
        api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {
                    "proposal_id": proposal_id})
```

### Phase B — tender linking (`main.py:337-351`)

For each tender/normative file:
- `PATCH /api/v1/processed-files/{file_id}` `{tender_id}` (line 340)
- if `original_file_id` exists: `PATCH /api/v1/original-files/{link_id}` `{tender_id}` (line 345)

```python
# main.py:337-347
for file_record in tender_normative_files:
    file_id = file_record["id"]
    api_request("PATCH", f"{API_PROCESSED_FILES_PATH}{file_id}", {
                "tender_id": tender_id})
    link_id = file_record.get("original_file_id")
    if link_id:
        api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}{link_id}", {
                    "tender_id": tender_id})
```

### Cost

Total ~`2 * N_files` sequential HTTP round trips (proposal files + tender/normative
files = essentially every file in the analysis, each patched on `processed_files`
and on `original_files`). At 30s timeout + retry backoff per call and zero
concurrency, an analysis with dozens/hundreds of files spends minutes here. This
is the tail the user observes.

### Important server-side detail (cascade)

`PATCH /original-files/{id}` is handled by `original_file_service.update()`
(`accsa-licitaciones-api/app/services/original_file_service.py:22-52`), which:
- guards `is_reorderable` (raises `ValueError` -> 400 if not reorderable),
- derives `category` from `proposal_id`/`tender_id` (proposal_id -> category="proposal", tender_id=None; etc.),
- updates `original_files`,
- **cascades** to processed files via
  `processed_file_repository.update_by_original_file_id(file_id, link_fields)`
  (sets proposal_id/tender_id/category on all processed files of that original).

So for files that HAVE an `original_file_id`, the original-files PATCH already
propagates to their processed files (including `category`). The grouper's direct
processed-files PATCH only sets `proposal_id`/`tender_id` (no `category`) and
matters mainly for files WITHOUT an original link. The grouper runs BEFORE
`lock_reordering` (`original_file_repository.py:37`), so files are still
reorderable at this stage and the guard passes.

---

## 4. API surface today (what exists)

Routers mounted in `accsa-licitaciones-api/app/api/v1/router.py` (lines 13-16).

processed-files (`app/api/v1/endpoints/processed_files.py`):
- `POST /processed-files/search` (lines 23-28)
- `PATCH /processed-files/{file_id}` (lines 37-42) -> `processed_file_service.update`
- repo write target is table `processed_files` (NOT the `processed_files_view`
  it reads from): `processed_file_repository.update_by_id` (`processed_file_repository.py:80-82`)

original-files (`app/api/v1/endpoints/original_files.py`):
- `PATCH /original-files/{file_id}` -> `original_file_service.update` (cascade above)
- repo write target table `original_files`: `original_file_repository.update_by_id` (`original_file_repository.py:33-35`)

proposals / tenders: `POST /` create, `DELETE /by-analysis/{analysis_id}` (used by cleanup).

**No bulk/batch update endpoint exists for processed_files or original_files.**

Bulk pattern already proven in the codebase (reuse as template):
- `POST /api/v1/analysis-requirements/bulk` (`endpoints/requirements.py:17-25`)
- `POST /api/v1/admissibility-requirements/bulk`
- Supabase `.in_()` multi-row filter already used:
  `compliance_matrix_repository.py:18`, `job_repository.py:51`.

Supabase client: `supabase-py` (`supabase>=2.0.0`), singleton at
`app/core/supabase.py`. Supports `supabase.table(t).update(data).in_("id", ids).execute()`
for multi-row update in ONE query.

Pydantic schemas:
- `ProcessedFileUpdate` (`app/schemas/processed_file.py:38-46`): `proposal_id`, `tender_id`, ...
- `OriginalFileUpdate` (`app/schemas/original_file.py:28-33`): `category`, `proposal_id`, `tender_id`, `is_reorderable`, ...

---

## 5. Approach A (recommended) — Bulk API endpoints

Idiomatic, biggest win. Reduces ~`2*N_files` calls to ~`O(num_proposals)` calls,
each a single Supabase `.in_()` update. Cost: must deploy API + grouper together.

### A.1 API — repositories

`app/repositories/processed_file_repository.py` — add:

```python
def update_by_ids(self, file_ids: list[str], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not file_ids:
        return []
    response = (
        supabase.table("processed_files")
        .update(data)
        .in_("id", file_ids)
        .execute()
    )
    return response.data

def update_by_original_file_ids(self, original_file_ids: list[str], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not original_file_ids:
        return []
    response = (
        supabase.table("processed_files")
        .update(data)
        .in_("original_file_id", original_file_ids)
        .execute()
    )
    return response.data
```

`app/repositories/original_file_repository.py` — add:

```python
def update_by_ids(self, file_ids: list[str], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not file_ids:
        return []
    response = (
        supabase.table("original_files")
        .update(data)
        .in_("id", file_ids)
        .execute()
    )
    return response.data
```

Note: writes target base tables (`processed_files`, `original_files`), mirroring
existing `update_by_id`. `.in_()` chunking is not needed for typical analysis
sizes; if a single analysis can exceed ~ a few hundred ids, chunk the list.

### A.2 API — services

`app/services/processed_file_service.py` — add:

```python
def bulk_set_link(self, file_ids: list[str], proposal_id: str | None = None,
                  tender_id: str | None = None) -> int:
    data = {}
    if proposal_id is not None:
        data["proposal_id"] = proposal_id
    if tender_id is not None:
        data["tender_id"] = tender_id
    if not data or not file_ids:
        return 0
    return len(self.repository.update_by_ids(file_ids, data))
```

`app/services/original_file_service.py` — add (preserves category derivation +
cascade; skips the per-row `is_reorderable` guard since the grouper runs
pre-lock and is a trusted internal caller):

```python
def bulk_set_link(self, file_ids: list[str], proposal_id: str | None = None,
                  tender_id: str | None = None) -> int:
    if not file_ids:
        return 0
    data: dict = {}
    if proposal_id is not None:
        data["proposal_id"] = proposal_id
        data["tender_id"] = None
        data["category"] = "proposal"
    elif tender_id is not None:
        data["tender_id"] = tender_id
        data["proposal_id"] = None
        data["category"] = "tender"
    else:
        return 0
    updated = self.repository.update_by_ids(file_ids, data)
    # cascade to processed files of these originals (mirror update())
    processed_file_repository.update_by_original_file_ids(file_ids, data)
    return len(updated)
```

(`processed_file_repository` is already imported in `original_file_service.py`.)

### A.3 API — schemas

Add to `app/schemas/processed_file.py` and `app/schemas/original_file.py` (or a
shared schema):

```python
class BulkLinkUpdate(BaseModel):
    file_ids: list[UUID]
    proposal_id: Optional[UUID] = None
    tender_id: Optional[UUID] = None
```

Response: reuse the simple `{"updated": n}` dict shape (like proposals/tenders
delete returns `{"deleted": n}`), or a tiny `BulkUpdateResponse(updated: int)`.

### A.4 API — endpoints

`app/api/v1/endpoints/processed_files.py` — add (place BEFORE the
`PATCH /{file_id}` route is not required since path is static `/bulk`, but keep
it grouped with other POST/PATCH routes; static `/bulk` won't collide with
`/{file_id}`):

```python
@router.patch("/bulk", response_model=dict)
def bulk_update_processed_files(payload: BulkLinkUpdate):
    if not payload.proposal_id and not payload.tender_id:
        raise HTTPException(status_code=400, detail="Provide proposal_id or tender_id")
    count = processed_file_service.bulk_set_link(
        [str(x) for x in payload.file_ids],
        proposal_id=str(payload.proposal_id) if payload.proposal_id else None,
        tender_id=str(payload.tender_id) if payload.tender_id else None,
    )
    return {"updated": count}
```

`app/api/v1/endpoints/original_files.py` — analogous, calling
`original_file_service.bulk_set_link(...)`.

### A.5 Service — grouper changes

`service-documents-grouper/main.py`:

Phase A (`create_proposals_and_update_files`, replace the inner per-file loop):

```python
proposal = api_request("POST", f"{API_PROPOSALS_PATH}", {
    "analysis_id": ANALYSIS_ID, "label": label, "provider_name": provider_name})
proposal_id = proposal["id"]

# bulk set proposal_id on processed files of this group
api_request("PATCH", f"{API_PROCESSED_FILES_PATH}bulk", {
    "file_ids": file_ids, "proposal_id": proposal_id})

# bulk set proposal_id on linked original files
link_ids = [file_lookup[fid]["original_file_id"] for fid in file_ids
            if file_lookup.get(fid) and file_lookup[fid].get("original_file_id")]
if link_ids:
    api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}bulk", {
        "file_ids": link_ids, "proposal_id": proposal_id})
```

Phase B (`create_tender_and_update_files`, replace the loop):

```python
file_ids = [f["id"] for f in tender_normative_files]
api_request("PATCH", f"{API_PROCESSED_FILES_PATH}bulk", {
    "file_ids": file_ids, "tender_id": tender_id})
link_ids = [f["original_file_id"] for f in tender_normative_files if f.get("original_file_id")]
if link_ids:
    api_request("PATCH", f"{API_ORIGINAL_FILES_PATH}bulk", {
        "file_ids": link_ids, "tender_id": tender_id})
```

Result: per proposal group = 3 calls (POST + 2 bulk) regardless of file count;
tender phase = 3 calls total. From `2*N_files` down to `~3*(num_proposals+1)`.

### A.6 Deploy

- API: redeploy backend.
- Service: rebuild + push image
  (`cd service-documents-grouper && ./build-and-push.sh azure`).
- Deploy together — grouper depends on the new endpoints.

---

## 6. Approach B (quick, services-only) — parallelize the loops

No API change. Keep N HTTP calls but run them concurrently. ~10-16x wall-time
reduction. Deploy grouper only. Lower ceiling than A (still N requests; adds
API/DB concurrent load).

### B.1 Bump connection pool

`global/supabase_logger.py` `make_session()` — add a sized adapter so the pool
isn't the bottleneck (urllib3 default pool_maxsize=10):

```python
adapter = HTTPAdapter(max_retries=retry, pool_maxsize=32, pool_connections=32)
```

### B.2 Parallelize PATCH loops in grouper

`service-documents-grouper/main.py`, using `concurrent.futures` (stdlib, no new
dep):

```python
from concurrent.futures import ThreadPoolExecutor

def _patch_file_links(items):
    # items: list of (method, path, body)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(api_request, m, p, b) for (m, p, b) in items]
        for fut in futures:
            fut.result()  # re-raise first error
```

Build the `items` list inside Phase A (per group) and Phase B from the same
file_id/link_id pairs the current loops use, then call `_patch_file_links(items)`.

Keep POST proposal / POST tender sequential (must run before their file PATCHes).

### B.3 Deploy

Rebuild + push grouper image only.

---

## 7. Recommendation

**Approach A.** It is the real fix (turns N+1 into a constant number of
bulk queries), matches the existing `/bulk` convention in the API, and uses
Supabase `.in_()` already present in the codebase. Approach B is a valid
stop-gap if a cross-project deploy must be avoided right now; the two are not
mutually exclusive (B could ship first, A later).

---

## 8. Files to touch (summary)

Approach A:
- `accsa-licitaciones-api/app/repositories/processed_file_repository.py` (add `update_by_ids`, `update_by_original_file_ids`)
- `accsa-licitaciones-api/app/repositories/original_file_repository.py` (add `update_by_ids`)
- `accsa-licitaciones-api/app/services/processed_file_service.py` (add `bulk_set_link`)
- `accsa-licitaciones-api/app/services/original_file_service.py` (add `bulk_set_link`)
- `accsa-licitaciones-api/app/schemas/processed_file.py` + `original_file.py` (add `BulkLinkUpdate`)
- `accsa-licitaciones-api/app/api/v1/endpoints/processed_files.py` + `original_files.py` (add `PATCH /bulk`)
- `accsa-licitaciones-services/service-documents-grouper/main.py` (Phase A + B loops)

Approach B:
- `accsa-licitaciones-services/global/supabase_logger.py` (`make_session` pool size)
- `accsa-licitaciones-services/service-documents-grouper/main.py` (ThreadPoolExecutor)

---

## 9. Verification

API (Approach A), local (`uvicorn app.main:app --reload`, port 8000):
- `PATCH /api/v1/processed-files/bulk` with `{file_ids:[...], proposal_id:"..."}`,
  header `X-API-Key`, expect `{"updated": N}`; confirm rows in Supabase have the
  field set (and untouched ids unchanged).
- Same for `/original-files/bulk`; confirm cascade set `proposal_id`/`category`
  on the matching processed files (query `processed_files` by `original_file_id`).
- 400 when neither `proposal_id` nor `tender_id` provided.

End-to-end:
- Run the grouper against a test analysis (set env vars + `ANALYSIS_ID`); confirm
  proposals + tender created, every proposal/tender file has correct
  `proposal_id`/`tender_id` on both `processed_files` and `original_files`, and
  total time dropped (compare logs timestamps for the linking phase).
- Confirm downstream jobs (`tender-classifier`, `build-proposal-index`,
  `compliance-matcher`) still receive correctly-linked files.

Approach B:
- Run grouper on a multi-file analysis; confirm same final DB state as before and
  reduced wall time; watch for any 429/5xx from the API under the added
  concurrency (retry/backoff should absorb).
