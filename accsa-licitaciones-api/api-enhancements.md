# API Enhancements - Code Review

Review of `accsa-licitaciones-api` (FastAPI / Python). Scope: structure, bugs,
security, performance, maintainability. Each finding has a location, the
problem, and a concrete fix. Items are tagged by severity:

- **[High]** data loss, broken in production, or exploitable.
- **[Med]** real bug or meaningful risk under normal use.
- **[Low]** correctness edge case, smell, or hardening.

Reviewed: `app/main.py`, `core/*`, `api/v1/router.py`, all endpoints touching
auth/destructive/LLM paths, `repositories/base_repository.py` + data layer,
`services/*` (analysis, chat, job monitor, infra config, email, audit),
`config.py`, `vercel.json`, `requirements.txt`.

## Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| S1 | High | Security | `/cleanup` wipes all data, guarded only by the shared API key |
| S2 | Med  | Security | CORS `allow_origins=["*"]` + `allow_credentials=True` |
| S3 | Med  | Security | 88x `detail=str(e)` leaks internal errors to clients |
| S4 | Med  | Security | Timing-unsafe API key comparison (`==`) |
| S5 | Low  | Security | Audit actor / IP fully spoofable via unsigned headers |
| S6 | Low  | Security | Unbounded chat input; `analysis_slug` not validated |
| S7 | Info | Security | Single shared API key for all clients, no scoping/rotation |
| B1 | High | Bug | Serverless mismatch: background monitor + in-memory upload tokens |
| B2 | Med  | Bug | Inconsistent naive vs UTC timestamps break timeout logic |
| B3 | Med  | Bug | `response.data[0]` with no guard -> `IndexError`/500 on missing row |
| B4 | Med  | Perf | Blocking I/O inside `async def` handlers stalls the event loop |
| B5 | Med  | Perf | Chat history grows unbounded in Redis; full list loaded each call |
| B6 | Low  | Bug | `get_history` negative-limit slice returns wrong window |
| B7 | Low  | Perf | List endpoints have no pagination (PostgREST 1000-row cap) |
| B8 | Low  | Bug | Redis client built from a REST URL env var |
| B9 | Low  | Perf | Gemini client re-created on every chat call |
| Q1 | Low  | Quality | `requirements.txt` fully unpinned |
| Q2 | Low  | Quality | ~88 duplicated try/except blocks; use a global handler |
| Q3 | Low  | Quality | Fake `health/supabase` check + dead comment block |
| Q4 | Low  | Quality | `print()` instead of logger; over-fetching `select("*")` |

---

## Security

### S1 [High] `/cleanup` is a one-request data wipe behind the shared API key

`app/api/v1/endpoints/cleanup.py:26`

`POST /api/v1/cleanup/` deletes every analysis (cascade), empties the
`artifacts` and `files` storage buckets, and drops all Qdrant collections. Its
only protection is the global `X-API-Key` dependency on `api_router`. Per the
monorepo `CLAUDE.md`, that same key is baked into every service image and used
by the UI proxy, so it is widely distributed. One leaked key, one stray script,
or one mistaken call destroys the entire system irreversibly. There is no
admin-role check, no environment guard, and no confirmation.

Fix: at minimum, refuse in production and require a second, separate secret.

```python
# cleanup.py
from app.core.config import get_settings

@router.post("/")
def cleanup_all(actor: Actor = Depends(get_actor), x_cleanup_token: str = Header(None)):
    settings = get_settings()
    if settings.APP_ENV == "production":
        raise HTTPException(status_code=403, detail="Disabled in production")
    if not settings.CLEANUP_TOKEN or not secrets.compare_digest(x_cleanup_token or "", settings.CLEANUP_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid cleanup token")
    ...
```

Better: remove the endpoint from the deployed app entirely and run cleanup as an
out-of-band admin script.

### S2 [Med] CORS allows any origin with credentials

`app/main.py:39-45`

```python
allow_origins=["*"],
allow_credentials=True,
allow_methods=["*"],
allow_headers=["*"],
```

With both `*` and `allow_credentials=True`, Starlette reflects the request
`Origin` back and sets `Access-Control-Allow-Credentials: true` for any caller.
The practical blast radius is limited today because the API authenticates with
`X-API-Key` (not cookies), but this is a flagged misconfiguration and becomes a
real cross-site issue the moment any cookie/session is introduced. The browser
only needs to reach `POST /analyses/` (direct upload with `X-Upload-Token`), so
the allowlist can be the known UI origin(s).

```python
allow_origins=[settings.FRONTEND_BASE_URL],   # plus localhost in dev
allow_credentials=False,                        # API uses header auth, not cookies
allow_methods=["GET", "POST", "PATCH", "DELETE"],
allow_headers=["X-API-Key", "X-Upload-Token", "Content-Type", "X-User-Id", "X-User-Email"],
```

### S3 [Med] Internal exception text returned to clients (88 occurrences)

Every endpoint follows `except Exception as e: raise HTTPException(500, detail=str(e))`.
Grep: 88 hits of `str(e)` inside `detail`. This leaks PostgREST/Supabase error
strings, table and column names, storage paths, and library internals to any
caller. It is also noisy and inconsistent (some paths log, most do not).

Fix: log the real error server-side, return a generic message. Centralize with a
handler (see Q2):

```python
@app.exception_handler(Exception)
async def unhandled(request, exc):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

### S4 [Med] Timing-unsafe API key comparison

`app/core/security.py:9` and `app/api/v1/endpoints/analyses_upload.py:25`

```python
if api_key_header == settings.BACKEND_API_KEY:
```

Plain `==` on secrets is vulnerable to timing analysis. Use a constant-time
compare:

```python
import secrets
if api_key_header and secrets.compare_digest(api_key_header, settings.BACKEND_API_KEY):
    return api_key_header
```

Apply the same in `_verify_auth` for both the API key and the upload token.

### S5 [Low] Audit actor and client IP are spoofable

`app/core/audit.py:21-29`

`actor_from_request` trusts `X-User-Id`, `X-User-Email`, and `X-Forwarded-For`
verbatim. Anyone able to call the API (anyone holding the shared key) can forge
the audit identity and source IP, which undermines the audit trail's value for
accountability. This is acceptable only while the trust boundary guarantees the
UI proxy is the sole caller. Document that assumption, and prefer reading
`X-Forwarded-For` only from the known proxy hop rather than the first untrusted
value in the chain.

### S6 [Low] Unbounded chat input; collection name not validated

`app/schemas/chat.py:6-9`, `app/services/chat_service.py:18-46`

`ChatRequest.message` has no length bound: a large message inflates embedding +
Gemini cost and latency (cost-amplification / soft DoS). `analysis_slug` is
passed straight into `qdrant_client.query_points(collection_name=...)` with no
validation that it corresponds to `file_id`'s analysis, so a key holder can probe
arbitrary collection names.

```python
from pydantic import Field
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    analysis_slug: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,128}$")
    file_id: str
```

### S7 [Info] Single shared API key for all clients

`app/core/config.py:16`

One `BACKEND_API_KEY` authenticates services, the UI proxy, and (transitively)
browser uploads, and gates both read endpoints and the destructive `/cleanup`.
There is no per-client key, no scope, and no rotation path. Consider distinct
keys per consumer and a privileged scope for admin/destructive routes so a leak
of the UI key cannot trigger S1.

---

## Bugs and correctness

### B1 [High] Serverless deployment vs in-memory state and background tasks

`vercel.json` deploys `app/main.py` via `@vercel/python` (serverless). Two
designs assume a single long-lived process and break there:

1. `app/main.py:18` starts `job_monitor_service.run_forever()` in the FastAPI
   lifespan. On serverless there is no persistent process to run this loop, so
   timed-out analyses are never auto-failed. `app/services/job_monitor_service.py`
   is otherwise correct (it uses `asyncio.to_thread`), but it needs a real
   runtime: a cron/scheduled function calling `_poll_once`, or a separate
   always-on worker.
2. `app/core/upload_tokens.py:4` stores tokens in a module-level dict
   `_upload_tokens`. A token issued by `POST /upload-token` on one invocation is
   invisible to `POST /analyses/` served by another instance, so the browser
   upload flow fails intermittently. Redis is already wired up - move tokens
   there:

```python
# upload_tokens.py
from app.core.redis_client import redis_client
def create_upload_token() -> str:
    token = "tok_" + secrets.token_urlsafe(32)
    redis_client.set(f"upload_token:{token}", "1", ex=TOKEN_TTL_SECONDS)
    return token
def consume_upload_token(token: str) -> bool:
    return redis_client.delete(f"upload_token:{token}") == 1   # atomic single-use
```

Also note `JobMonitorService._processing` (`job_monitor_service.py:20`) is a
per-process set; with multiple workers it does not prevent two instances from
failing the same analysis.

### B2 [Med] Mixed naive/UTC timestamps corrupt timeout detection

`app/repositories/workflow_step_repository.py`

`start_step_by_code:43` and `get_timed_out_steps:56` correctly use
`datetime.now(timezone.utc)`, but `complete_step_if_running:70` and
`claim_step_if_pending:82` write `datetime.now().isoformat()` (naive, local
time). `get_timed_out_steps` compares `started_at` against a UTC cutoff. When a
step's `started_at` was written by `claim_step_if_pending` and the host is not on
UTC, the comparison is wrong and steps time out early or never. The same naive
pattern appears in `services/workflow_step_service.py` and
`services/workflow_phase_service.py`. Standardize on UTC everywhere:

```python
from datetime import datetime, timezone
datetime.now(timezone.utc).isoformat()
```

### B3 [Med] `response.data[0]` without guard raises on missing row

`app/repositories/base_repository.py:14,22`, `analysis_repository.py:34`, and
others (26 `data[0]` sites total).

```python
def update_by_id(self, record_id, data):
    response = supabase.table(self.table_name).update(data).eq("id", record_id).execute()
    return response.data[0]      # IndexError if id matched nothing -> 500
```

Updating a non-existent id returns an empty list and raises `IndexError`, which
surfaces as a 500 instead of a clean 404. `get_by_id` already guards with
`data[0] if response.data else None`; apply the same consistently and let the
service layer translate "no row" into 404.

### B4 [Med] Blocking I/O inside `async def` handlers

`async def` handlers that call the synchronous Supabase/OpenAI/Qdrant/Gemini/Azure
clients block the single event loop for the whole call, serializing all
concurrent requests on that worker:

- `app/api/v1/endpoints/chat.py:9,25` -> `chat_service.chat` (Redis + OpenAI
  embeddings + Qdrant + Gemini, multi-second).
- `app/api/v1/endpoints/jobs.py:23,56` -> orchestrator (DB + Azure job launches).
- `app/api/v1/endpoints/analyses_upload.py:37` ->
  `analysis_service.create_analysis_from_storage`, itself `async def` but calling
  only blocking methods (`analysis_service.py:25-65`).

Pick one model. Simplest: make these handlers plain `def` so FastAPI runs them in
its threadpool (the rest of the codebase already does this, e.g.
`analyses.py:read_analyses`). Or offload with `await asyncio.to_thread(...)` /
`run_in_threadpool(...)`. Do not leave `async def` wrapping blocking clients.

### B5 [Med] Chat history grows unbounded; full list read each turn

`app/services/chat_service.py:21,86-87`

`chat()` does `redis_client.lrange(history_key, 0, -1)` (loads the entire history)
and then `rpush`es two more entries every turn, with no `LTRIM`. Over a long
conversation this reads and transfers an ever-larger list to use only the last 20
messages. Read just the tail and cap the stored length:

```python
raw_history = redis_client.lrange(history_key, -20, -1)
...
pipe = redis_client.pipeline()
pipe.rpush(history_key, json.dumps({"role": "user", "content": message}))
pipe.rpush(history_key, json.dumps({"role": "assistant", "content": response_text}))
pipe.ltrim(history_key, -40, -1)
pipe.expire(history_key, 60 * 60 * 24 * 30)   # optional TTL
pipe.execute()
```

### B6 [Low] `get_history` mishandles a negative limit

`app/services/chat_service.py:91-96`

`capped_limit = min(limit, 20)` lets a negative `limit` through, and
`history[-capped_limit:]` then returns the wrong slice (e.g. `limit=-5` returns
everything from index 5). Clamp on both ends and enforce in the schema:

```python
capped_limit = max(1, min(limit, 20))
```

### B7 [Low] List endpoints have no pagination

`app/repositories/base_repository.py:9`, `analysis_repository.py:11-16`

`get_all` issues `select("*")` with no `.range()`. PostgREST caps results at 1000
rows by default, so once analyses exceed that, `GET /analyses/` and the `/admin`
all-scope view silently truncate. Add `limit`/`offset` (`.range(start, end)`)
parameters and surface them through the endpoint.

### B8 [Low] Redis client built from a REST URL

`app/core/redis_client.py:6`, `app/core/config.py:20`

```python
redis_client = redis.Redis.from_url(settings.UPSTASH_REDIS_REST_URL, decode_responses=True)
```

`redis-py`'s `from_url` expects a `redis://` / `rediss://` URL. Upstash's REST URL
is an `https://` endpoint and is not a valid Redis protocol URL. Either the env
var actually holds the `rediss://` connection string (in which case rename it to
`UPSTASH_REDIS_URL` to stop the confusion) or this is broken at runtime. Verify
and rename accordingly.

### B9 [Low] Gemini client re-created per chat call

`app/services/chat_service.py:66`

`gemini_client = genai.Client(api_key=...)` runs on every `chat()` call. Build it
once in `__init__` alongside `self.openai_client`.

---

## Quality, structure, and ops

### Q1 [Low] Dependencies are unpinned

`requirements.txt` uses `>=` or bare names for everything, including fast-moving
SDKs (`openai`, `google-genai`, `azure-identity`, `azure-mgmt-appcontainers`,
`redis`). Builds are not reproducible and a transitive bump can break production
without a code change. Pin exact versions (`pip freeze` / a lockfile) and update
deliberately.

### Q2 [Low] ~88 duplicated try/except blocks

Nearly every endpoint repeats `try: ... except Exception as e: raise
HTTPException(500, str(e))`. This is the source of S3 and a maintenance burden.
Replace with a global exception handler plus a small set of domain exceptions
(e.g. `NotFoundError -> 404`, `ValidationError -> 400`), then delete the
per-endpoint boilerplate.

### Q3 [Low] `health/supabase` does not check Supabase

`app/api/v1/router.py:45-73` returns `{"status": "ok", "supabase": "configured"}`
without touching the database, and carries ~15 lines of stream-of-consciousness
comments. Make it a real lightweight probe or rename it to reflect that it only
checks client construction:

```python
@api_router.get("/health/supabase")
async def supabase_health_check():
    try:
        supabase.table("analyses").select("id").limit(1).execute()
        return {"status": "ok", "service": "supabase"}
    except Exception:
        raise HTTPException(status_code=503, detail="Supabase connection failed")
```

### Q4 [Low] Logging and query hygiene

- `app/core/azure.py:32` and `app/api/v1/endpoints/qdrant.py` use `print()`; use
  the module `logger`.
- `BaseRepository.get_all` and most reads use `select("*")`. Select only the
  columns the caller needs to cut payload size and avoid leaking columns.
- `Settings.model_config` uses `extra="ignore"` (`config.py:46`): a misspelled
  env var name is silently dropped rather than failing fast. Consider `extra="forbid"`
  in development.

---

## Suggested order of work

1. **S1** - lock down or remove `/cleanup` (highest blast radius).
2. **B1** - move upload tokens to Redis; give the job monitor a real runtime.
3. **S3 + Q2** - global exception handler (kills the leak and the boilerplate).
4. **B2** - standardize all timestamps on UTC.
5. **B4** - fix blocking calls in async handlers.
6. **S2, S4, B3, B5** - CORS allowlist, constant-time compare, `data[0]` guards,
   chat history trim.
7. Remaining Low/Info items as cleanup.
