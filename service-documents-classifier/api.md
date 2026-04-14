# API Endpoints — service-documents-classifier

## Endpoints consumidos

### GET /api/v1/processed-files/{file_id}
Obtiene el registro de un archivo procesado (markdown).
- **Response:** `{file_record}`

### PATCH /api/v1/processed-files/{file_id}
Actualiza campos de un archivo procesado.
- **Campos usados:** `category`

### PATCH /api/v1/original-files/{file_id}
Propaga la categoría al archivo original vinculado (`original_file_id` field).
- **Campos usados:** `category`

### POST /api/v1/events/
Registra un evento de log.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).

### POST /api/v1/jobs/callback
Notifica finalización del job.
