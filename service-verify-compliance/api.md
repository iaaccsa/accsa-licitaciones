# API Endpoints — service-verify-compliance

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### POST /api/v1/proposals/search
Busca proposals por filtro.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{proposal_record}, ...]`

### POST /api/v1/requirements/search
Busca requisitos por filtro.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{requirement_record}, ...]`

### PUT /api/v1/compliance-results/
Upsert en batch de resultados de cumplimiento.
- **Request:** `[{proposal_id, requirement_id, status, evidence_quote, reasoning, suggestion}, ...]`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
