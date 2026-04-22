# DB Views

SQL to recreate the four public views. Run these after modifying the base tables.

---

## analyses_view

Agrega conteos de eventos, archivos, propuestas y requerimientos a cada analisis.

Tablas base: `analyses`, `events`, `original_files`, `proposals`, `analysis_requirements`

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
    (SELECT count(*) FROM original_files f WHERE f.analysis_id = a.id)::integer AS total_files,
    (SELECT count(*) FROM proposals p WHERE p.analysis_id = a.id)::integer AS total_proposals,
    (SELECT count(*) FROM analysis_requirements r WHERE r.analysis_id = a.id)::integer AS total_requirements
FROM analyses a;
```

---

## original_files_view

Expone todos los campos de `original_files`.

Tabla base: `original_files`

```sql
CREATE OR REPLACE VIEW original_files_view AS
SELECT
    id,
    analysis_id,
    file_name,
    storage_path,
    file_size,
    mime_type,
    created_at,
    category,
    proposal_id,
    tender_id,
    is_reorderable
FROM original_files;
```

---

## processed_files_view

Expone todos los campos de `processed_files` y enriquece cada fila con el nombre, path y mime_type del archivo original vinculado via `original_file_id`.

Tablas base: `processed_files` LEFT JOIN `original_files`

```sql
CREATE OR REPLACE VIEW processed_files_view AS
SELECT
    pf.id,
    pf.analysis_id,
    pf.original_file_id,
    pf.file_name,
    pf.storage_path,
    pf.file_size,
    pf.mime_type,
    pf.created_at,
    pf.is_merged,
    pf.metadata,
    pf.total_chunks,
    pf.category,
    pf.proposal_id,
    pf.tender_id,
    of.file_name AS original_file_name,
    of.storage_path AS original_storage_path,
    of.mime_type AS original_mime_type
FROM processed_files pf
LEFT JOIN original_files of ON of.id = pf.original_file_id;
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
    admissibility_status,
    admissibility_started_at,
    admissibility_completed_at,
    admissibility_error,
    admissibility_reasons,
    admissibility_overridden_by,
    created_at,
    updated_at,
    (SELECT count(*) FROM proposal_compliance_results cr WHERE cr.proposal_id = p.id)::integer AS total_compliance_results
FROM proposals p;
```

---

## analysis_compliance_matrix_view

Expone todos los campos de `analysis_compliance_matrix` enriquecidos con el `slug` del análisis y el `requirement_code` del requerimiento.

Tablas base: `analysis_compliance_matrix`, `analyses`, `analysis_requirements`

```sql
CREATE OR REPLACE VIEW analysis_compliance_matrix_view AS
SELECT
    m.id,
    m.analysis_id,
    m.requirement_id,
    m.proposal_id,
    m.verdict,
    m.confidence,
    m.reasoning,
    m.missing_elements,
    m.citations,
    m.manual_verification_required,
    m.extraction_batch_id,
    m.is_verified,
    m.reviewed_by,
    m.reviewed_at,
    m.notes,
    m.created_at,
    m.updated_at,
    a.slug AS analysis_slug,
    r.requirement_code
FROM analysis_compliance_matrix m
JOIN analyses a ON a.id = m.analysis_id
JOIN analysis_requirements r ON r.id = m.requirement_id;
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
