# API Endpoints — service-file-extractor

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{artifact_path, slug, ...}`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis.
- **Campos usados:** `status`, `is_success`

### POST /api/v1/original-files/
Crea un registro de archivo original.
- **Request:** `{analysis_id, file_name, storage_path, category, file_size, mime_type}`

### DELETE /api/v1/original-files/by-analysis/{analysis_id}
Limpieza al inicio: elimina todos los `original_files` del análisis de ejecuciones previas.
- **Estado:** pendiente de implementar en backend (ver `todo-api.md`).
- Si el endpoint no existe, el servicio registra un warning y continúa.

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
