# API Endpoints — service-documents-classifier

## Endpoints consumidos

### GET /api/v1/files/{file_id}
Obtiene el registro de un archivo individual.
- **Response:** `{file_record}`

### PATCH /api/v1/files/{file_id}
Actualiza campos de un archivo.
- **Campos usados:** `category`

### POST /api/v1/events/
Registra un evento de log.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).

### POST /api/v1/jobs/callback
Notifica finalización del job.
