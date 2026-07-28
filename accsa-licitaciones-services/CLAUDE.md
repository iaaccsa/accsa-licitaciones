# accsa-licitaciones-services

Python microservices for automated analysis of public tenders. Each service is an **Azure Container Apps Job** (ephemeral container) triggered by the FastAPI orchestrator.

**Processing pipeline:**
```
file-extractor → files-converter-mistral → qdrant-by-file (fan-out per file)
  ├─ file-metadata-extractor (fan-out per file)
  └─ digital-sig-extractor (fan-out per original file)
      → documents-classifier (fan-in: waits both parents)
        → documents-grouper [pausa]
          → admissibility-extractor [pausa]
            → build-proposal-index (fan-out per proposal)
              → admissibility-matcher (fan-out per proposal)
                → admissibility-gate [pausa]
                  → tender-classifier
                    → requirement-extractor [pausa]
                      → compliance-matcher (fan-out per admitida proposal)
                        ├─ compliance-summarizer
                        └─ economic-offer-extractor
```

The chain is linear: only one approval pause is pending at a time. Admissibility
runs before the general extraction, so a pliego with no admissibility requirements
(or an analysis where no proposal is admitida) is cut short by the API before any
of the downstream LLM work runs.

Qdrant model:
- `FILE_{analysis_slug}_{file_id}` — source of truth; one per processed file (created by
  `service-qdrant-by-file`). Tender services (admissibility-extractor, tender-classifier,
  requirement-extractor) iterate these directly.
- `PROPOSAL_{analysis_slug}_{proposal_id}` — built by `service-build-proposal-index` (one
  job per proposal). Copies all points (vectors + payload) from the proposal's
  `FILE_{...}` collections. Admissibility-matcher and compliance-matcher issue a single
  ANN query per requirement against this collection.

See root `CLAUDE.md` for cross-project context and common rules.

## Services

| Service | Purpose |
|---------|---------|
| `service-file-extractor` | Downloads ZIP from API, extracts files, uploads to Supabase |
| `service-files-converter-mistral` | Converts PDFs to Markdown via Mistral OCR; inserts `<!-- page:N -->` markers |
| `service-qdrant-by-file` | Per-file chunking + indexing into `FILE_{slug}_{file_id}` collections (filename, page_number, file_id in payload) |
| `service-file-metadata-extractor` | Extracts metadata from each processed file |
| `service-digital-sig-extractor` | Extracts digital signatures from original PDFs |
| `service-documents-classifier` | Classifies each file into category (tender, proposal, ...) |
| `service-documents-grouper` | Groups files into proposals |
| `service-admissibility-extractor` | Extracts admissibility requirements (ADM-nnn); scrolls per-file tender collections, sorts by filename + chunk_index |
| `service-build-proposal-index` | Per proposal, copies all points from `FILE_{slug}_{file_id}` of that proposal into `PROPOSAL_{slug}_{proposal_id}` |
| `service-admissibility-matcher` | Verdict per admissibility requirement vs proposal; single ANN query against `PROPOSAL_{slug}_{proposal_id}` |
| `service-admissibility-gate` | Admitida/rechazada per proposal, from the admissibility results |
| `service-tender-classifier` | Determines evaluation system; queries per-file tender collections |
| `service-requirement-extractor` | Extracts the other (non-admissibility) requirements (REQ-nnn), classified on 7 axes against the evaluation_profile |
| `service-compliance-matcher` | Verdict per requirement vs proposal; single ANN query against `PROPOSAL_{slug}_{proposal_id}` |
| `service-compliance-summarizer` | Summarizes compliance per proposal |
| `service-economic-offer-extractor` | Extracts the economic offer per proposal |

**Naming constraint:** Service name must be < 32 characters (Azure ACA Job limit).

## Tech Stack

- Python 3.12, `pip` + `requirements.txt` per service (no monorepo manager)
- Docker: `FROM python:3.12-slim`, built with `--platform linux/amd64` (required for Azure, esp. Apple Silicon)
- LLMs: OpenAI GPT-4 / GPT-4o
- Parsing: LlamaParse (LlamaCloud)
- Vector DB: Qdrant (AWS sa-east-1). Per-file `FILE_{analysis_slug}_{file_id}` + per-proposal `PROPOSAL_{analysis_slug}_{proposal_id}`. 1536-dim vectors (`text-embedding-3-small`).
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
