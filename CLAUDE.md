# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
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
- `POST /api/upload` → forwards ZIP to `{API_BASE_URL}{API_ANALYSES_PATH}/`
- `GET /api/analyses/list` → list all analyses
- `GET /api/analyses/[id]` → fetch all, filter by id
- `POST /api/analyses/[id]/workflow` → workflow steps (uses `API_WORKFLOW_STEPS_PATH`)
- `GET /api/analyses/[id]/events`, `/files`, `/requirements`, `/proposals` → search endpoints
- `GET /api/analyses/[id]/files/[fileId]/chunks` → Qdrant vector chunks
- `GET /api/analyses/[id]/proposals/[proposalId]/compliance` → compliance results

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
