# API Endpoints — service-requirement-extractor

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### POST /api/v1/requirements/
Crea requisitos en batch.
- **Request:** `[{analysis_id, category, requirement_text, requirement_code, is_mandatory, rag_chunk_id}, ...]`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
