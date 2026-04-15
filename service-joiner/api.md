# API Endpoints — service-joiner

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### POST /api/v1/processed-files/search
Busca archivos procesados por filtro.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{file_record}, ...]`

### POST /api/v1/processed-files/
Crea un registro de archivo procesado (merged).
- **Request:** `{analysis_id, file_name, storage_path, category, file_size, mime_type, is_merged, proposal_id?}`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
