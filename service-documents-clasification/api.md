# API Endpoints — service-documents-clasification

## Endpoints consumidos

### POST /api/v1/files/search
Busca archivos por `analysis_id`.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{file_record}, ...]`

### PATCH /api/v1/files/{file_id}
Actualiza campos de un archivo.
- **Campos usados:** `category`, `proposal_id`

### POST /api/v1/proposals/ *(PENDIENTE)*
Crea un nuevo proposal.
- **Request:** `{"analysis_id": "uuid", "label": "string", "provider_name": "string | null"}`
- **Response:** `{"id": "uuid", ...}`

### POST /api/v1/events/
Registra un evento de log.

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).

### POST /api/v1/jobs/callback
Notifica finalización del job.
