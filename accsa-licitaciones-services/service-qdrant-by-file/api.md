# API Endpoints — service-qdrant-by-file

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### GET /api/v1/processed-files/{file_id}
Obtiene el registro de un archivo procesado (markdown).

### PATCH /api/v1/processed-files/{file_id}
Actualiza campos de un archivo procesado.
- **Campos usados:** `total_chunks`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, file_id, status, error_message?}`

## Limpieza al inicio (no via API)

Antes de indexar, el servicio elimina vía `qdrant_client` la colección
`FILE_{slug}_{FILE_ID}` si ya existe, y la vuelve a crear vacía. Esto garantiza una
re-indexación limpia si el job se relanza. No requiere endpoint del backend.
