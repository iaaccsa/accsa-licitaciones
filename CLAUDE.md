# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev         # Start development server on http://localhost:3000
pnpm build       # Production build
pnpm lint        # Run ESLint
```

There are no tests configured in this project.

## Architecture

**Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui components.

Path alias `@/*` maps to `./src/*`.

### Application Structure

The app is a procurement/tendering assistant ("Asistente de Licitaciones") that:
1. Accepts PDF uploads (tender documents + proposals), zips them client-side, and POSTs to the backend
2. Displays analysis status, workflow steps, files, requirements, proposals, and compliance results

**Pages** (`src/app/`):
- `/` — Upload new analysis (UploadSection packs files into a ZIP via jszip, lazy-loaded)
- `/analyses` — List of all analyses (grouped by active vs. completed)
- `/analyses/[id]` — Analysis detail: workflow visualization tree + nav to files/requirements/events/proposals
- `/analyses/[id]/files`, `/events`, `/requirements` — Sub-sections of an analysis
- `/analyses/[id]/proposals/[proposalId]` — Proposal detail with compliance results
- `/admin` — Server Component; calls all four health endpoints in parallel to show backend/Supabase/Qdrant/Azure status

### API Proxy Pattern

All Next.js API routes (`src/app/api/`) act as a **server-side proxy** to the backend. They:
- Read `API_BASE_URL`, the relevant path env var, and `BACKEND_API_KEY` from `process.env`
- Forward requests to the backend with `X-API-Key: <BACKEND_API_KEY>` header
- The browser never directly contacts the backend or sees the API key

**API routes**:
- `POST /api/analyses` → creates analysis; injects `created_by` (session user id) and `user_email` (session email) into the body server-side, overwriting anything from the browser
- `GET /api/analyses/list` → list analyses filtered by `created_by={session user}`; admins can pass `?scope=all` to list everything (used by `/admin`)
- `GET /api/analyses/[id]` → fetch all, filter by id
- `POST /api/analyses/[id]/workflow` → workflow steps (uses `API_WORKFLOW_STEPS_PATH`)
- `GET /api/analyses/[id]/events`, `/files`, `/requirements`, `/proposals` → search endpoints
- `GET /api/analyses/[id]/files/[fileId]/chunks` → Qdrant vector chunks
- `GET /api/analyses/[id]/proposals/[proposalId]/compliance` → compliance results

**Ownership enforcement**: `analyses.created_by` stores the creator's Supabase user id. Every `/api/analyses/[id]/*` route calls `requireAnalysisAccess(id)` (`src/lib/supabase/require-analysis-access.ts`): admins pass, owners pass, everyone else gets 404 (404 instead of 403 to avoid leaking ids). Entity-level routes (`/api/files/[fileId]`, `/api/requirements/[requirementId]`, `/api/compliance-matrix/[entryId]`, `/api/admissibility-requirements/[requirementId]`, `/api/admissibility-results/[entryId]`) resolve the parent `analysis_id` via `requireEntityAnalysisAccess(table, entityId)`. Chat routes check `analysis_id` from the validated body.

### Environment Variables

All server-side (not prefixed with `NEXT_PUBLIC_`):
- `API_BASE_URL` — Backend base URL
- `BACKEND_API_KEY` — Sent as `X-API-Key` on every backend request
- `API_ANALYSES_PATH`, `API_EVENTS_PATH`, `API_ORIGINAL_FILES_PATH`, `API_PROCESSED_FILES_PATH`, `API_PROPOSALS_PATH`, `API_REQUIREMENTS_PATH`, `API_WORKFLOW_STEPS_PATH`, `API_COMPLIANCE_RESULTS_PATH`, `API_QDRANT_POINTS` — Backend route paths
- `API_HEALTH_PATH`, `API_HEALTH_SUPABASE_PATH`, `API_HEALTH_QDRANT_PATH`, `API_HEALTH_AZURE_PATH` — Health check paths

Public:
- `NEXT_PUBLIC_SUPABASE_STORAGE_URL` — Supabase storage base URL for file display

### Component Conventions

- All pages are `"use client"` except `/admin` (async Server Component)
- UI primitives live in `src/components/ui/` (button, badge, card, separator, skeleton) — these are shadcn/ui components
- Business components live in `src/components/`
- Icons come from `lucide-react`
- Tailwind uses the `zinc` color palette as the base neutral
- Analysis statuses: `"pending" | "processing" | "ready" | "failed"`
- Proposal statuses: `"pending" | "processed" | "finished"`

### WorkflowVisualization

`src/components/WorkflowVisualization.tsx` renders a custom tree layout using absolute positioning and SVG bezier curves. It builds a parent→children hierarchy from `{ code, parent_code, status }` step objects, calculates coordinates recursively, and animates running steps with dashed SVG strokes.

See root `CLAUDE.md` for cross-project context and common rules (Approach, Output, Code Rules, Review Rules, Debugging, Formatting).
