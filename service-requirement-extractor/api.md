# API Endpoints -- service-requirement-extractor

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis (slug de la coleccion Qdrant).
- **Response:** `{slug, ...}`

### GET /api/v1/tender-classifications/{analysis_id}
Obtiene el evaluation_profile producido por service-tender-classifier.
- **Validacion:** `profile_version` debe ser 2. Si no, el servicio aborta.
- **Response:** `{system_type, factors, enabled_roles, profile_version, ...}`

### POST /api/v1/analysis-requirements/bulk?analysis_id=<uuid>
Reemplaza atomicamente todos los requerimientos del analisis.
- **Query param:** `analysis_id` (uuid)
- **Request:** `[{requirement_code, requirement_text, requirement_summary, roles, mapped_factors, domain, weight, verification_method, temporal_scope, citations, confidence, extraction_batch_id, notes}, ...]`
- **Comportamiento:** el endpoint elimina los registros previos del analysis_id y crea los nuevos en una sola transaccion.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del analisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalizacion del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
