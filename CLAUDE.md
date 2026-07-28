# Licitaciones — Monorepo

Procurement/tendering assistant. Three projects that must stay in sync.

## Pendiente de implementar — Extracción Dedicada de Admisibilidad (Path 1)

Feature definida y especificada, **aún NO implementada**. Para saber qué falta:
- **`spec.md`** (raíz): especificación completa y autocontenida. Diseño,
  tablas nuevas (DDL), cambios por proyecto. Leer primero.
- **`ToDo.md`** (raíz): checklist granular por fases (0 DB, 1 API, 2 services,
  3 UI, 4 verificación). Marcar `[x]` al avanzar. Implementar paso por paso
  (control de tokens).

Resumen: agregar una **segunda pasada LLM por batch** en
`service-requirement-extractor` con un prompt dedicado a admisibilidad
(derivado de `prueba prompt smart grouping.md`, sin `evaluation_profile`).
Datos 100% separados en 2 tablas nuevas: `admissibility_requirements` y
`admissibility_results`. `service-compliance-matcher` se modifica para
matchear también la tabla nueva. `service-admissibility-gate` se repunta a las
tablas nuevas, **mismo lugar en el DAG**. **NO** hay reorder, fase nueva,
HITL temprano ni services nuevos. Decisión admitida/rechazada sigue en
`proposals.admissibility_status` como hoy. Migraciones vía **MCP Supabase**.
Decisiones cerradas en `spec.md` (no re-debatir). Estado: 0 tareas hechas.

Path 2 (gate temprano + reorder + HITL temprano + ahorro cómputo) queda fuera
de alcance hoy. Si más adelante hace falta, promover.

## Projects

| Project | Stack | Purpose |
|---------|-------|---------|
| `accsa-licitaciones-ui` | Next.js 16, React 19, TS, Tailwind, shadcn/ui | Browser frontend. Proxies all API calls server-side. |
| `accsa-licitaciones-api` | FastAPI, Python, Supabase, Qdrant, Azure | Orchestrator. Receives uploads, manages pipeline, serves data. |
| `accsa-licitaciones-services` | Python 3.12, Docker, Azure Container Apps Jobs | Microservices. Each runs as ephemeral ACA Job triggered by the API. |

## System Pipeline

```
UI (upload ZIP)
  → API (stores in Supabase, initializes workflow steps)
    → services pipeline via Azure Container Apps Jobs:
        file-extractor → files-converter-mistral
          → qdrant-by-file (fan-out per file → per-file Qdrant collections
              FILE_{slug}_{file_id} with payload preserving filename, page_number, file_id)
            ├─ file-metadata-extractor (fan-out per processed file)
            └─ digital-sig-extractor (fan-out per original file)
                → documents-classifier (fan-in: waits for metadata + signatures)
                  → documents-grouper [pausa]
                    → admissibility-extractor (scrolls per-file tender collections,
                        sorts by filename then chunk_index; ADM-nnn) [pausa]
                      → build-proposal-index (fan-out per proposal; copies points from
                          per-file proposal collections into PROPOSAL_{slug}_{proposal_id})
                        → admissibility-matcher (fan-out per proposal; single ANN
                            query against PROPOSAL_{slug}_{proposal_id})
                          → admissibility-gate [pausa]
                            → tender-classifier (queries per-file tender collections)
                              → requirement-extractor (otros requisitos, REQ-nnn) [pausa]
                                → compliance-matcher (fan-out por propuesta admitida)
                                  ├─ compliance-summarizer
                                  └─ economic-offer-extractor
              → API callback → UI shows results
```

Admisibilidad primero: si el pliego no tiene requisitos de admisibilidad, o si
ninguna propuesta queda admitida en el gate, la API corta el pipeline y no
gasta cómputo en tender-classifier, requirement-extractor ni compliance.

## Cross-Project Change Guide

When a feature or change is requested, always identify which projects are affected:

| Change | UI | API | Services |
|--------|----|-----|----------|
| New entity/field | Add API route proxy + types + display | Add schema + repo + service + endpoint | Update relevant service(s) if they read/write it |
| New pipeline step | Update WorkflowVisualization if new step node | Add to `pipeline_config.json` + job orchestration | Create new service folder |
| New analysis status | Add to status type union + display logic | Update schema enum | - |
| New compliance/requirement field | Add to proposal detail display | Update schema + compliance endpoint | Update `verify-compliance` service |
| Auth change | Update proxy header in API routes | Update `security.py` | Update `API_KEY` env var baked into image |
| New Supabase table | Add API proxy route if UI needs it | Add repo + service + endpoint | Update service if it reads/writes the table |
| Backend URL/path change | Update env vars in `.env.local` | - | Update env vars in `.env.local` + pipeline vars |

## Shared Infrastructure

- **Supabase** (PostgreSQL + Storage): canonical data store. Tables: `analyses`, `files`, `proposals`, `events`, `workflow_steps`, `requirements`, `compliance_results`.
- **Qdrant** (AWS sa-east-1): vector DB. Per-file collections `FILE_{analysis_slug}_{file_id}` (source of truth) plus per-proposal aggregations `PROPOSAL_{analysis_slug}_{proposal_id}` (for compliance-matcher ANN). 1536-dim vectors (`text-embedding-3-small`). Payload preserves `filename`, `page_number`, `file_id`, `category`, `proposal_id`.
- **Azure Container Registry**: `accsalicitaciones.azurecr.io` — stores service images.
- **Azure Container Apps Environment**: `env-licitaciones`, resource group `accsa-licitaciones`, region `eastus`.

## Dev Quick Start

```bash
# UI
cd accsa-licitaciones-ui && pnpm dev           # http://localhost:3000

# API
cd accsa-licitaciones-api
source venv/bin/activate && uvicorn app.main:app --reload  # http://localhost:8000/docs

# Services — build local (from service folder)
cd accsa-licitaciones-services/service-file-extractor
./build-and-push.sh local
```

## Common Rules

### Approach
- Think before acting. Read existing files before writing code.
- Prefer editing over rewriting whole files.
- Do not re-read files already read unless changed.
- Test code before declaring done.
- User instructions always override this file.

### Output
- Return code first. Explanation after, only if non-obvious.
- No inline prose. Comments only where logic is unclear.
- No boilerplate unless explicitly requested.

### Code Rules
- Simplest working solution. No over-engineering.
- No abstractions for single-use operations.
- No speculative features.
- Read the file before modifying it. Never edit blind.
- No docstrings or type annotations on code not being changed.
- No error handling for scenarios that cannot happen.
- Three similar lines is better than a premature abstraction.

### Review Rules
- State the bug. Show the fix. Stop.
- No suggestions beyond the scope of the review.
- No compliments before or after.

### Debugging Rules
- Never speculate about a bug without reading the relevant code first.
- State what you found, where, and the fix. One pass.
- If cause is unclear: say so. Do not guess.

### Formatting
- No em dashes, smart quotes, or decorative Unicode symbols.
- Plain hyphens and straight quotes only.
- Natural language characters (accented letters, etc.) are fine when content requires.
- Code output must be copy-paste safe.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
