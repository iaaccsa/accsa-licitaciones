# DB Views

SQL to recreate the four public views. Run these after modifying the base tables.

---

## analyses_view

Agrega conteos de eventos, archivos, propuestas y requerimientos a cada analisis.

Tablas base: `analyses`, `events`, `files`, `proposals`, `analysis_requirements`

```sql
CREATE OR REPLACE VIEW analyses_view AS
SELECT
    id,
    slug,
    status,
    is_success,
    artifact_path,
    created_at,
    updated_at,
    user_name,
    generated_name,
    paused_at_service,
    user_email,
    (SELECT count(*) FROM events e WHERE e.analysis_id = a.id)::integer AS total_events,
    (SELECT count(*) FROM files f WHERE f.analysis_id = a.id)::integer AS total_files,
    (SELECT count(*) FROM proposals p WHERE p.analysis_id = a.id)::integer AS total_proposals,
    (SELECT count(*) FROM analysis_requirements r WHERE r.analysis_id = a.id)::integer AS total_requirements
FROM analyses a;
```

---

## files_view

Expone todos los campos de `files` y enriquece cada fila con el nombre, path y mime_type del archivo vinculado via la columna `link` (auto-referencia).

Tablas base: `files` (self-join via `files.link -> files.id`)

```sql
CREATE OR REPLACE VIEW files_view AS
SELECT
    f.id,
    f.analysis_id,
    f.file_name,
    f.storage_path,
    f.file_size,
    f.mime_type,
    f.is_processed_version,
    f.created_at,
    f.category,
    f.proposal_id,
    f.is_merged,
    f.total_chunks,
    f.metadata,
    f.link,
    f.is_reorderable,
    f.tender_id,
    linked.file_name AS linked_file_name,
    linked.storage_path AS linked_storage_path,
    linked.mime_type AS linked_mime_type
FROM files f
LEFT JOIN files linked ON linked.id = f.link;
```

---

## proposals_view

Agrega el conteo de resultados de compliance a cada propuesta.

Tablas base: `proposals`, `proposal_compliance_results`

```sql
CREATE OR REPLACE VIEW proposals_view AS
SELECT
    id,
    analysis_id,
    label,
    provider_name,
    provider_metadata,
    matching_status,
    matching_started_at,
    matching_completed_at,
    matching_error,
    summarizing_started_at,
    summarizing_completed_at,
    summary_error,
    compliance_rate,
    compliance_counts,
    compliance_summary,
    critical_failures_count,
    created_at,
    updated_at,
    (SELECT count(*) FROM proposal_compliance_results cr WHERE cr.proposal_id = p.id)::integer AS total_compliance_results
FROM proposals p;
```

---

## tenders_view

Vista simple sobre `tenders` (sin transformaciones, sin joins).

Tabla base: `tenders`

```sql
CREATE OR REPLACE VIEW tenders_view AS
SELECT
    id,
    analysis_id,
    label,
    provider_name,
    created_at
FROM tenders t;
```
