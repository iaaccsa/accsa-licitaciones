---
name: Changelog conventions
description: Unified changelog + shared versioning for accsa-licitaciones-services (the changelog file lives in the sibling UI repo)
type: project
---

The Licitaciones system uses a SINGLE unified changelog and a SINGLE shared version across the three projects (ui, api, services). Unified on 2026-06-24 starting at 2.0.0. This repo NO LONGER has its own CHANGELOG.md (removed 2026-06-24).

**Changelog location:** `../accsa-licitaciones-ui/CHANGELOG.md` (the UI repo, a sibling directory of this repo). Edit that file; do not create a local CHANGELOG.md here.

**Structure:** version -> project -> type. Services changes go under `[Unreleased]` -> `### accsa-licitaciones-services` -> `#### Added/Changed/Fixed/Removed/...`.

**Current version:** 2.0.0 (2026-06-24), unified (was 1.2.0 before unification; the pre-2.0.0 services history, 1.2.0 down to 0.1.0, is preserved verbatim under the `## Historial previo` block in the unified file).

**How to apply:**
- Language: Spanish, infinitive verbs ("Agregar", "Corregir", "Migrar"). Group related commits (e.g., a service + its CI/CD enablement) into single entries. No comparison-links footer.
- Skip pure CI pipeline churn (commenting/uncommenting services in `azure-pipelines.yml`) as non-notable.
- Version source of truth in this repo: the `VERSION` file at the repo root. It is COPYed into every service image (`COPY VERSION .` in each Dockerfile), read at import by `global/supabase_logger.py`, and appended to every event `source` (e.g. `ACA: service-x v2.0.0`). Mirrors the shared system version.
- On release: bump the shared version in all three repos and tag `v<version>` here.
