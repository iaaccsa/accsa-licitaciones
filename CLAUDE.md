# CLAUDE.md - Licitaciones API Assistant

## Project Description

FastAPI backend that orchestrates the procurement document processing pipeline. Receives ZIP files with tender documents, uploads them to Supabase Storage, and triggers a chain of Azure Container Apps Jobs to process them. The final result is requirement extraction and compliance verification against a proposal.

## Tech Stack

- **Framework:** FastAPI with Pydantic v2 + pydantic-settings
- **Database / Storage:** Supabase (PostgreSQL via Python client)
- **Vector DB:** Qdrant
- **Jobs infra:** Azure Container Apps Jobs (`azure-mgmt-appcontainers`)
- **Auth:** API Key in `X-API-Key` header (all routes under `/api/v1`)
- **Runtime:** Python 3.8+ with venv (`venv/`)
- **Dev server:** `uvicorn app.main:app --reload` or `python -m app.main`

## Project Structure

```
app/
├── main.py                         # Entry point, CORS, router mount
├── api/v1/
│   ├── router.py                   # Main router + health checks (/health, /health/supabase, /health/qdrant, /health/azure)
│   └── endpoints/
│       ├── analyses.py             # CRUD analyses + upload ZIP
│       ├── jobs.py                 # POST /jobs/start and /jobs/callback
│       ├── workflow_steps.py       # POST /workflow-steps/search, PUT /workflow-steps/
│       ├── events.py
│       ├── files.py
│       ├── proposals.py
│       ├── requirements.py
│       ├── compliance_results.py
│       └── qdrant.py
├── core/
│   ├── config.py                   # Settings with pydantic-settings (lru_cache)
│   ├── security.py                 # get_api_key dependency (X-API-Key header)
│   ├── supabase.py                 # Supabase singleton client
│   ├── azure.py                    # Azure Container Apps client + verify_azure_connection()
│   └── qdrant.py                   # Qdrant client + verify_qdrant_connection()
├── repositories/
│   ├── base_repository.py          # get_all, create, create_batch, update_by_id
│   └── [entity]_repository.py     # Inherits BaseRepository, table in Supabase
├── services/
│   ├── analysis_service.py         # Creates analysis: upload → DB → event → workflow steps → pipeline
│   ├── job_orchestrator_service.py # start_pipeline() and on_job_completed() - orchestration logic
│   ├── workflow_step_service.py    # initialize_steps, complete_step_by_service, start_step_by_service
│   └── [entity]_service.py
├── schemas/
│   └── [entity].py                 # Pydantic v2 BaseModel
└── config/
    ├── pipeline_config.json        # Unified config: jobs DAG + workflow steps metadata
    └── jobs_config.py              # Parses JSON → get_root_jobs(), get_next_jobs(), is_valid_job()
```

## Required Environment Variables

```env
SUPABASE_URL=
SUPABASE_KEY=
QDRANT_URL=
QDRANT_API_KEY=          # optional
BACKEND_API_KEY=         # used in X-API-Key header
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_SUBSCRIPTION_ID=
AZURE_RESOURCE_GROUP=
AZURE_CONTAINER_REGISTRY=
```

File: `.env` (git-ignored). See `.env.example`.

## How to Run

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run dev server
uvicorn app.main:app --reload
# or
python -m app.main
```

Interactive docs: http://localhost:8000/docs

## Jobs Pipeline Architecture

The pipeline is a DAG of Azure Container Apps Jobs defined in `pipeline_config.json`:

```
service-file-extractor
  → service-files-converter
    → service-setup-qdrant
      → service-chunk-and-index
        → service-requirement-extractor → service-verify-compliance
        → service-metadata-extractor
```

**Orchestration flow:**
1. `POST /api/v1/analyses/` -> uploads ZIP to Supabase Storage, creates record, initializes workflow steps, calls `job_orchestrator_service.start_pipeline()`
2. `start_pipeline()` -> completes `service-queue` step, starts first job step, launches Azure Container App Job with `ANALYSIS_ID` and `PROPOSAL_ID` as env vars
3. Each job, on completion, calls `POST /api/v1/jobs/callback`
4. `on_job_completed()` -> updates job state in DB, completes/fails workflow step, launches next job in chain
5. When the last job completes, the pipeline finishes

## Workflow Steps

Each analysis has progress steps tracked in Supabase (`workflow_steps` table). Config is in `pipeline_config.json`:
- `create_on_start: true` -> created when analysis starts
- `is_initial: true` -> marked as `completed` immediately (e.g. `service-queue`)
- Possible states: `pending`, `running`, `completed`
- Upsert uses `analysis_id + code` as unique key

## Security

- All `/api/v1` routes require header `X-API-Key: <BACKEND_API_KEY>`
- The `get_api_key` dep is applied globally in `api_router` (`router.py:8`)
- No exact key match -> HTTP 403

## Established Code Patterns

- **Repositories:** singleton at end of file (`analysis_repository = AnalysisRepository()`)
- **Services:** singleton at end (`analysis_service = AnalysisService()`)
- **Endpoints:** no business logic, only delegate to service and handle HTTPException
- **Config:** `get_settings()` with `@lru_cache()`, never instantiate `Settings()` directly
- **Supabase client:** import from `app.core.supabase` (global singleton)
- **Schemas:** Pydantic v2 (`model_config = ConfigDict(from_attributes=True)` in responses)

## Installed Skill

- **`fastapi-templates`** (in `.agents/skills/fastapi-templates/SKILL.md`): Production templates and patterns for FastAPI. Use with `/fastapi-templates` when creating new FastAPI project structures.

## Important Reference Files

- `api-orquestator.md` - Documentation for `/jobs/start` and `/jobs/callback` endpoints with request/response examples
- `app/config/pipeline_config.json` - Unified config: jobs pipeline DAG + workflow steps metadata

## Development Notes

- Project uses **venv** (not poetry, not conda). Activate before any Python command.
- No tests implemented yet.
- `example.py` and `test_analysis.txt/zip` are manual test files in the root (not production code).
- CORS configured with `allow_origins=["*"]` - appropriate for development, review for production.
- Supabase and Azure clients initialize on module import (not lazy). If env vars are missing, the server will fail on startup.

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

## Output

- Return code first. Explanation after, only if non-obvious.
- No inline prose. Use comments sparingly - only where logic is unclear.
- No boilerplate unless explicitly requested.

## Code Rules

- Simplest working solution. No over-engineering.
- No abstractions for single-use operations.
- No speculative features or "you might also want..."
- Read the file before modifying it. Never edit blind.
- No docstrings or type annotations on code not being changed.
- No error handling for scenarios that cannot happen.
- Three similar lines is better than a premature abstraction.

## Review Rules

- State the bug. Show the fix. Stop.
- No suggestions beyond the scope of the review.
- No compliments on the code before or after the review.

## Debugging Rules

- Never speculate about a bug without reading the relevant code first.
- State what you found, where, and the fix. One pass.
- If cause is unclear: say so. Do not guess.

## Simple Formatting

- No em dashes, smart quotes, or decorative Unicode symbols.
- Plain hyphens and straight quotes only.
- Natural language characters (accented letters, CJK, etc.) are fine when the content requires them.
- Code output must be copy-paste safe.

