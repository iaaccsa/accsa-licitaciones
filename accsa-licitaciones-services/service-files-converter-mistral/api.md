# API Endpoints — service-files-converter-mistral

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### POST /api/v1/original-files/search
Busca archivos originales por filtro.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{file_record}, ...]`

### POST /api/v1/processed-files/
Crea un registro de archivo procesado (versión markdown convertida).
- **Request:** `{analysis_id, file_name, storage_path, category, file_size, mime_type, is_merged, original_file_id}`

### DELETE /api/v1/processed-files/by-analysis/{analysis_id}?is_merged=false
Limpieza al inicio: elimina archivos procesados (no-merged) de ejecuciones previas.
- **Estado:** pendiente de implementar en backend (ver `todo-api.md`).
- Si el endpoint no existe, el servicio registra un warning y continúa.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
