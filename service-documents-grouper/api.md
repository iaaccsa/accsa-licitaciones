# API Endpoints — service-documents-grouper

## Endpoints consumidos

### POST /api/v1/processed-files/search
Busca archivos procesados por `analysis_id`.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{file_record}, ...]`
- **Campos requeridos en respuesta:** `id`, `file_name`, `category`, `metadata`, `original_file_id`, `digital_signatures`

### PATCH /api/v1/processed-files/{file_id}
Actualiza campos de un archivo procesado.
- **Campos usados:** `proposal_id`, `tender_id`

### PATCH /api/v1/original-files/{file_id}
Propaga campos al archivo original vinculado (`original_file_id` field).
- **Campos usados:** `proposal_id`, `tender_id`

### POST /api/v1/proposals/
Crea un nuevo proposal.
- **Request:** `{"analysis_id": "uuid", "label": "string", "provider_name": "string | null"}`
- **Response:** `{"id": "uuid", ...}`

### POST /api/v1/tenders/
Crea un nuevo tender (uno por análisis).
- **Request:** `{"analysis_id": "uuid", "label": "string | null", "provider_name": "string | null"}`
- **Response:** `{"id": "uuid", ...}`

### DELETE /api/v1/proposals/by-analysis/{analysis_id}
Limpieza al inicio: elimina todos los `proposals` del análisis y nullifica / cascada los FKs.
- **Estado:** pendiente de implementar en backend (ver `todo-api.md`).
- Si el endpoint no existe, el servicio registra un warning y continúa.

### DELETE /api/v1/tenders/by-analysis/{analysis_id}
Limpieza al inicio: elimina todos los `tenders` del análisis y nullifica / cascada los FKs.
- **Estado:** pendiente de implementar en backend (ver `todo-api.md`).
- Si el endpoint no existe, el servicio registra un warning y continúa.

### PATCH /api/v1/analyses/{analysis_id}
Actualiza campos del análisis.
- **Campos usados:** `generated_name`

### POST /api/v1/events/
Registra un evento de log.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).

### POST /api/v1/jobs/callback
Notifica finalización del job.
