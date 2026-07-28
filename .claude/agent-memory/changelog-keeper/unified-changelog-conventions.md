---
name: unified-changelog-conventions
description: "Where the single unified changelog lives and its exact structure/conventions for the Licitaciones monorepo (3 repos, one shared version)"
metadata:
  type: project
---

The Licitaciones system uses ONE unified changelog for all three repos, not per-project files.

**Location:** `accsa-licitaciones-ui/CHANGELOG.md` (single file). The api and services repos have NO local changelog. If invoked from api or services, still edit the file in the UI repo.
**Read first:** `accsa-licitaciones-ui/RELEASING.md` — authoritative for format and the release/version-bump process.

**Structure (this OVERRIDES the default flat Keep-a-Changelog template):**
`## [X.Y.Z]` version -> `### <project>` (accsa-licitaciones-ui / -api / -services) -> `#### <Type>` -> bullets.
Types in canonical order: Added, Changed, Deprecated, Removed, Fixed, Security.

**Where new work goes:** the `## [Unreleased]` block, which permanently keeps the three empty `### <project>` subsections. Add `#### <Type>` under the right project. Do NOT create a new version/tag during normal dev — that only happens on release (see RELEASING.md).
Below `[Unreleased]` and the current `## [2.0.0]` there is a `## Historial previo (pre-unificación)` block with per-project pre-2.0.0 history — never touch it.

**Versioning:** single shared SemVer for all 3 repos, bumped together. Currently at 2.0.0 (first unified release, 2026-06-24). Full context in the user auto-memory `feature-unified-changelog-versioning.md`.

**Writing conventions:** Spanish, infinitive verbs (Agregar, Ampliar, Corregir, Migrar, Eliminar). Backticks for routes/services/env vars/identifiers (e.g. `/api/...`, `service-x`, `X-Upload-Token`). Group related commits into one entry. Omit noise (pure CI, code typos). Internal-only repo docs (`docs/*.md`) are NOT logged as standalone entries — this changelog carries only user-facing/system-behavior changes; note redistribution inside the relevant entry instead.
