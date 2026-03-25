---
name: Changelog conventions
description: Versioning pattern, language, and structure used in the project's CHANGELOG.md
type: project
---

Project has no git tags. Versions in CHANGELOG.md were assigned based on logical groupings of commits by date and feature scope, starting at 0.1.0.

**Current version:** 0.9.0 (2026-02-23). Next changes go in [Unreleased].

**Why:** The project has never cut an official release; version numbers reflect the natural progression of features (initial service -> more services -> CI/CD -> refactors -> LLM migration).

**How to apply:**
- All entries are in Spanish, using infinitive verbs ("Agregar", "Corregir", "Migrar").
- Categories used so far: Added, Changed, Fixed. No Deprecated, Removed, or Security yet.
- Hosted on Azure DevOps (not GitHub), so no comparison links at bottom of file.
- Group related commits (e.g., service + its CI/CD enablement) into single entries.
