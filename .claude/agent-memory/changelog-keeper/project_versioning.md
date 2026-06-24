---
name: project_versioning
description: Unified changelog + shared versioning for the Licitaciones monorepo (the changelog source file lives in THIS UI repo)
type: project
---

The Licitaciones system uses a SINGLE unified changelog and a SINGLE shared version across the three projects (accsa-licitaciones-ui, accsa-licitaciones-api, accsa-licitaciones-services). Unified on 2026-06-24 starting at version 2.0.0.

**Changelog location:** `CHANGELOG.md` at the root of THIS repo (accsa-licitaciones-ui) is the single source of truth for ALL three projects. The standalone changelogs in the api and services repos were removed on 2026-06-24.

**Structure:** version -> project -> type.
```
## [Unreleased]
### accsa-licitaciones-ui
### accsa-licitaciones-api
### accsa-licitaciones-services

## [2.0.0] - 2026-06-24
### accsa-licitaciones-ui
#### Added / #### Changed / #### Fixed / #### Removed
### accsa-licitaciones-api
...
### accsa-licitaciones-services
...
```
Below the released versions there is a `## Historial previo (pre-unificación)` block preserving each project's pre-2.0.0 history (`#### [x.y.z]` per version, `#####` for types). Do NOT modify that block.

**Current version:** 2.0.0 (2026-06-24), unified. Next changes go in `[Unreleased]` under the matching `### <project>` subsection.

**How to apply:**
- UI changes go under `[Unreleased]` -> `### accsa-licitaciones-ui` -> `#### <type>`.
- Spanish, infinitive verbs ("Agregar", "Corregir", "Migrar", "Eliminar"). Group related commits. No comparison-links footer.
- Version source of truth in this repo: `package.json` `version` field (mirrors the shared system version), exposed to the app via `NEXT_PUBLIC_APP_VERSION` in `next.config.ts` and shown in the Footer. The `/changelog` page (`src/app/changelog/page.tsx`) renders this CHANGELOG.md statically.
- On release: bump the shared version in all three repos (UI `package.json`, API `app/core/config.py` `VERSION`, services `VERSION` file), move `[Unreleased]` into a new `## [x.y.z] - date` block, and tag `v<version>` in each repo.
- Remote: git@github-accsa:iaaccsa/accsa-licitaciones-ui.git (org: iaaccsa).
