# CLAUDE.md — accsa-licitaciones-services

## Project Description

Python microservices system for automated analysis of public tenders. Each service is an **Azure Container Apps Job** (ephemeral container) that runs on-demand from an orchestrator implemented in the backend (FastAPI).

**General flow:**
```
Backend (FastAPI orchestrator) → POST /start → Azure Container Apps Job (ACR)
```

**Processing pipeline:**
```
file-extractor → files-converter → setup-qdrant → chunk-and-index → iterative-requirement-extractor → verify-compliance
```

---

## Architecture

### Infrastructure

| Resource          | Value                                        |
|-------------------|----------------------------------------------|
| Subscription ID   | `d3fbaef6-2413-47bf-be3d-2019470dc20e`       |
| Resource Group    | `accsa-licitaciones`                         |
| ACA Environment   | `env-licitaciones`                           |
| ACR               | `accsalicitaciones.azurecr.io`               |
| Region            | `eastus`                                     |
| Base image        | `accsalicitaciones.azurecr.io/services/<service-name>:latest` |

### Databases

- **Supabase** (PostgreSQL + Storage): primary backend. Tables: `analyses`, `files`, `proposals`, `events`.
- **Qdrant** (vector DB, AWS sa-east-1): semantic search. Collections named by `analysis_slug`. Vectors of 1536 dims (`text-embedding-3-small`).

### Shared Code

- `global/supabase_logger.py` — copied to each image in the Dockerfile. Provides `setup_logger()`, `log_event()`, and `mark_failed()`.

---

## Services

| Service | ACA Job | CPU | Mem | Timeout | Purpose |
|---------|---------|-----|-----|---------|---------|
| `service-file-extractor` | `file-extractor` | 1 | 2Gi | 30 min | Downloads ZIP from the API, extracts files, uploads to Supabase Storage |
| `service-files-converter-llama` | `files-converter` | 2 | 4Gi | 60 min | Converts PDFs to Markdown via LlamaParse |
| `service-setup-qdrant` | `setup-qdrant` | 0.5 | 1Gi | 10 min | Creates/recreates Qdrant collections for the analysis |
| `service-chunk-and-index` | `chunk-and-index` | 1 | 2Gi | 30 min | Chunks Markdown, generates OpenAI embeddings, indexes into Qdrant |
| `service-iterative-requirement-extractor` | `iterative-requirement-extractor` | 1 | 2Gi | — | Extracts requirements from tender documents via Qdrant + GPT |
| `service-verify-compliance` | `verify-compliance` | 1 | 2Gi | — | Verifies proposal compliance via Qdrant + Cohere reranking + GPT-4 |

---

## Tech Stack

- **Language:** Python 3.12
- **Dependencies:** `pip` + `requirements.txt` per service (no monorepo manager)
- **Containers:** Docker with `FROM python:3.12-slim`, compiled for `--platform linux/amd64`
- **CI/CD:** Azure Pipelines (matrix build, trigger on `main`)
- **LLMs:** OpenAI GPT-4 / GPT-4o
- **Parsing:** LlamaParse (LlamaCloud)
- **Vector DB:** Qdrant
- **Reranking:** Cohere
- **Backend API:** Own REST API authenticated with `X-API-Key`

---

## Development Commands

### Local build (from the service folder)

```bash
# Requires ../.env.local with the necessary variables
cd service-file-extractor
./build-and-push.sh local
```

The script in `local` mode:
- Reads variables from `../.env.local` (repo root)
- Uses `--no-cache` in Docker build
- **Does not push** to ACR

### Build for Azure (CI/CD)

```bash
cd service-file-extractor
./build-and-push.sh azure
```

The script in `azure` mode:
- Takes variables from the environment (injected by the pipeline)
- Builds and pushes to ACR

> **IMPORTANT:** Always use `--platform linux/amd64`. Required for Azure, especially from Apple Silicon (M1/M2/M3). Already included in the scripts.

### Create a Container App Job (once per service)

```bash
./create-azure-container-app-job.sh service-file-extractor
```

Valid services: `service-file-extractor`, `service-files-converter-llama`, `service-chunk-and-index`, `service-setup-qdrant`, `service-iterative-requirement-extractor`, `service-verify-compliance`.

### Useful Azure commands

```bash
# List executions of a job
az containerapp job execution list \
  --name file-extractor \
  --resource-group accsa-licitaciones -o table

# View logs of an execution
az containerapp job logs show \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --execution "<EXECUTION_NAME>"

# Update image after a new build
az containerapp job update \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --image accsalicitaciones.azurecr.io/services/service-file-extractor:latest

# Trigger manually from CLI
az containerapp job start \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --yaml job-template.yaml
```

---

## CI/CD — Azure Pipelines

File: `azure-pipelines.yml`

- **Trigger:** push to `main`
- **Strategy:** matrix (parallel service builds)
- **Currently enabled services:** `service-file-extractor`, `service-files-converter-llama`
- **To enable another service:** uncomment its entry in the `strategy.matrix` section

**Variable groups required in Azure DevOps:**
- `othes-vars`: ACR credentials (`AZURE_REGISTRY_SERVER`, `AZURE_REGISTRY_USER`, `AZURE_REGISTRY_PASS`)
- `api-vars`: backend API keys and paths
- `supabase-vars`: Supabase credentials

---

## Environment Variables

### Variables baked into the Docker image (build args)

| Variable | Service(s) | Description |
|----------|------------|-------------|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | All | Supabase service role key |
| `SUPABASE_ARTIFACTS_BASE_URL` | file-extractor | Base URL for downloading artifacts |
| `SUPABASE_FILES_BASE_URL` | files-converter | Base URL for downloading files |
| `API_BASE_URL` | All | Backend REST base URL |
| `API_KEY` | All | Authentication key (`X-API-Key`) |
| `API_EVENTS_PATH` | All | Events path (default: `/api/v1/events/`) |
| `API_PROPOSALS_PATH` | All | Proposals path |
| `API_ANALYSES_PATH` | All | Analyses path |
| `API_FILES_PATH` | All | Files path |
| `API_JOBS_CALLBACK` | All | Callback path on completion |
| `OPENAI_API_KEY` | chunk-and-index, iterative-req-ext, verify-compliance | OpenAI API key |
| `LLAMA_CLOUD_API_KEY` | files-converter | LlamaCloud/LlamaParse API key |
| `QDRANT_URL` | chunk-and-index, setup-qdrant, iterative-req-ext, verify-compliance | Qdrant URL |
| `QDRANT_API_KEY` | chunk-and-index, setup-qdrant, iterative-req-ext, verify-compliance | Qdrant API key |
| `COHERE_API_KEY` | verify-compliance | Cohere API key |
| `GOOGLE_API_KEY` | (configured, pending use) | Google API key |

### Variables passed at runtime (when triggering the job from the orchestrator)

| Variable | Service(s) | Description |
|----------|------------|-------------|
| `ANALYSIS_ID` | All | UUID of the ongoing analysis |
| `FILE_ID` | chunk-and-index | UUID of the file to process |
| `PROPOSAL_ID` | verify-compliance | UUID of the proposal to verify |

> Jobs **have no secrets configured in Azure**. All static variables are baked into the image; dynamic ones are injected when triggering the job.

---

## Code Conventions

### Structure of each service

```
service-<name>/
  main.py           # Single entry point
  Dockerfile        # Container build
  requirements.txt  # Python dependencies
  build-and-push.sh # Local/azure build script
```

> **Naming constraint:** Service name must be < 32 characters (Azure ACA Job limit).

### Established Python patterns

```python
# Config from environment variables (module level)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

# Standard logger
try:
    from supabase_logger import setup_logger, log_event, mark_failed
except ImportError:
    # Fallback for local development
    ...
logger = setup_logger(__name__)

# Env var validation with early exit
def validate_env():
    missing = [var for var, val in [("VAR", VAR)] if not val]
    if missing:
        logger.error(f"Missing env vars: {', '.join(missing)}")
        sys.exit(1)

# Event logging via API (not direct container logs)
log_event(analysis_id, "info", "Message", "service-name")
mark_failed(analysis_id, "Fatal error", "service-name")
```

### Dockerfile pattern

```dockerfile
FROM python:3.12-slim
WORKDIR /app

# 1. Declare ARGs and ENVs
# 2. Validate required ARGs with RUN test -n
# 3. Install system deps if needed
# 4. pip install requirements.txt --no-cache-dir
# 5. COPY global/supabase_logger.py .
# 6. COPY service-<name>/main.py .
# 7. RUN mkdir -p /app/workspace
# 8. CMD ["python", "main.py"]
```

**Build context:** repo root (not the service folder). COPYs are relative to the root.

---

## Orchestrator → Azure Integration (triggering jobs)

Azure Container Apps Jobs are invoked from the **orchestrator implemented in the backend (FastAPI)**. The orchestrator manages the pipeline sequence and passes runtime variables to each job.

**Azure endpoint to trigger a job:**
```
POST https://management.azure.com/subscriptions/{SUBSCRIPTION_ID}/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/{JOB_NAME}/start?api-version=2024-03-01
```

**Body (IMPORTANT):** `containers` goes directly in the body, **NOT** inside `"template"`:
```json
{
  "containers": [
    {
      "name": "file-extractor",
      "image": "accsalicitaciones.azurecr.io/services/service-file-extractor:latest",
      "env": [
        { "name": "ANALYSIS_ID", "value": "{{ANALYSIS_ID}}" }
      ]
    }
  ]
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Image fails in ACA but works locally | Verify it was compiled with `--platform linux/amd64` |
| `Unknown properties template in StartJobExecutionTemplate` | The POST `/start` body takes `containers` directly, NOT inside `"template"` |
| `Operation not permitted: ~/.azure/commands/` | `sudo chmod -R u+rw ~/.azure/commands/` |
| Build arg validation fails in Docker | Verify all required variables are defined in `.env.local` or in the environment |
| Variable `SUPABASE_SERVICE_ROLE_KEY` not found | Renamed to `SUPABASE_SERVICE_KEY` across all services and pipelines |

---

## Key Files

| File | Purpose |
|------|---------|
| `azure-pipelines.yml` | CI/CD pipeline — enable/disable services here |
| `create-azure-container-app-job.sh` | Creates the ACA Job in Azure (once per service) |
| `global/supabase_logger.py` | Shared logger copied into each image |
| `DEPLOYMENT.md` | Full infrastructure and deployment guide |
| `api-doc.md` | Backend API endpoint reference |
| `.env.local` | Local variables (gitignored) — required for local builds |
| `job-template.yaml` | YAML template for triggering jobs from CLI |
| `scripts/create-infrastructure.sh` | Initial Azure environment setup (one-time) |

---

## Approach
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

---

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
