# API Endpoints — service-qdrant-by-file

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### GET /api/v1/files/{file_id}
Obtiene el registro de un archivo específico.

### PATCH /api/v1/files/{file_id}
Actualiza campos de un archivo.
- **Campos usados:** `total_chunks`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, file_id, status, error_message?}`
