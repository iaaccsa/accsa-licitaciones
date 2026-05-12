# accsa-licitaciones-services

Python microservices for automated analysis of public tenders. Each service is an **Azure Container Apps Job** (ephemeral container) triggered by the FastAPI orchestrator.

**Processing pipeline:**
```
file-extractor → files-converter → setup-qdrant → chunk-and-index
  → iterative-requirement-extractor → verify-compliance
```

See root `CLAUDE.md` for cross-project context and common rules.

## Services

| Service | ACA Job | CPU | Mem | Purpose |
|---------|---------|-----|-----|---------|
| `service-file-extractor` | `file-extractor` | 1 | 2Gi | Downloads ZIP from API, extracts files, uploads to Supabase |
| `service-files-converter-llama` | `files-converter` | 2 | 4Gi | Converts PDFs to Markdown via LlamaParse |
| `service-setup-qdrant` | `setup-qdrant` | 0.5 | 1Gi | Creates/recreates Qdrant collections for the analysis |
| `service-chunk-and-index` | `chunk-and-index` | 1 | 2Gi | Chunks Markdown, generates OpenAI embeddings, indexes into Qdrant |
| `service-iterative-requirement-extractor` | `iterative-requirement-extractor` | 1 | 2Gi | Extracts requirements via Qdrant + GPT |
| `service-verify-compliance` | `verify-compliance` | 1 | 2Gi | Verifies proposal compliance via Qdrant + Cohere + GPT-4 |

**Naming constraint:** Service name must be < 32 characters (Azure ACA Job limit).

## Tech Stack

- Python 3.12, `pip` + `requirements.txt` per service (no monorepo manager)
- Docker: `FROM python:3.12-slim`, built with `--platform linux/amd64` (required for Azure, esp. Apple Silicon)
- LLMs: OpenAI GPT-4 / GPT-4o
- Parsing: LlamaParse (LlamaCloud)
- Vector DB: Qdrant (AWS sa-east-1), collections named by `analysis_slug`, 1536-dim vectors (`text-embedding-3-small`)
- Reranking: Cohere

## Development Commands

```bash
# Local build (from the service folder)
# Requires ../.env.local with necessary variables
cd service-file-extractor
./build-and-push.sh local   # builds, does NOT push to ACR

# Build for Azure (CI/CD)
./build-and-push.sh azure   # builds and pushes to ACR
```

IMPORTANT: Always use `--platform linux/amd64`. Already included in the scripts.

See [docs/infrastructure.md](docs/infrastructure.md) for Azure CLI commands, CI/CD config, env vars, and troubleshooting.

## Code Conventions

### Service structure

```
service-<name>/
  main.py           # Single entry point
  Dockerfile        # Container build
  requirements.txt  # Python dependencies
  build-and-push.sh # Local/azure build script
```

### Python patterns

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

Build context: repo root (not the service folder). COPYs are relative to the root.

## Shared Code

`global/supabase_logger.py` — copied to each image in the Dockerfile. Provides `setup_logger()`, `log_event()`, and `mark_failed()`.

## Databases

- **Supabase** (PostgreSQL + Storage): primary backend. Tables: `analyses`, `files`, `proposals`, `events`.
- **Qdrant** (AWS sa-east-1): semantic search. Collections named by `analysis_slug`.
