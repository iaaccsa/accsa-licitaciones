---
name: Changelog conventions
description: Versioning pattern, language, and structure used in the project's CHANGELOG.md
type: project
---

Project has git tag `v1.1.0` pointing to commit 224f16b. Versions in CHANGELOG.md were assigned based on logical groupings of commits by date and feature scope, starting at 0.1.0.

**Current version:** 1.1.0 (2026-03-31). Next changes go in [Unreleased].

**Why:** Version 1.1.0 marks a major feature release with document classification pipeline, file metadata extraction, and file joining services. The jump from 0.9.0 to 1.1.0 reflects the project reaching production maturity.

**How to apply:**
- All entries are in Spanish, using infinitive verbs ("Agregar", "Corregir", "Migrar").
- Categories used so far: Added, Changed, Fixed. No Deprecated, Removed, or Security yet.
- Hosted on Azure DevOps (not GitHub), so no comparison links at bottom of file.
- Group related commits (e.g., service + its CI/CD enablement) into single entries.
