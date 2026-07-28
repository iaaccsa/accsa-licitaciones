---
name: Changelog conventions
description: Unified changelog + shared versioning for accsa-licitaciones-api (the changelog file lives in the sibling UI repo)
type: project
---

The Licitaciones system uses a SINGLE unified changelog and a SINGLE shared version across the three projects (ui, api, services). Unified on 2026-06-24 starting at 2.0.0. This repo NO LONGER has its own CHANGELOG.md (removed 2026-06-24).

**Changelog location:** `../accsa-licitaciones-ui/CHANGELOG.md` (the UI repo, a sibling directory of this repo). Edit that file; do not create a local CHANGELOG.md here.

**Structure:** version -> project -> type. API changes go under `[Unreleased]` -> `### accsa-licitaciones-api` -> `#### Added/Changed/Fixed/Removed/...`.

**Current version:** 2.0.0 (2026-06-24), unified (was 1.1.0 before unification; the pre-2.0.0 API history is preserved verbatim under the `## Historial previo` block in the unified file).

**How to apply:**
- Language: Spanish, verbs in infinitive ("Agregar", "Corregir", "Implementar"). Group related commits. No comparison-links footer.
- Version source of truth in this repo: `VERSION` constant in `app/core/config.py`, exposed at `GET /version`. Mirrors the shared system version.
- On release: bump the shared version in all three repos and tag `v<version>` here.
- Remote: git@github-accsa:iaaccsa/accsa-licitaciones-api.git
- User preference: NO "Co-Authored-By: Claude ..." in commits.
