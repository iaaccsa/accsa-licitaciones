# API Endpoints -- service-copy-indexs

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis (slug de la coleccion Qdrant principal).
- **Response:** `{slug, ...}`

### PATCH /api/v1/processed-files/{file_id}
Actualiza campos de un archivo procesado.
- **Campos usados:** `total_chunks`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del analisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalizacion del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`

## Limpieza al inicio (no via API)

Antes de copiar, el servicio elimina via `qdrant_client` los puntos con
`file_id=FILE_ID` de la coleccion principal (`{slug}`). Esto garantiza una
copia limpia si el job se relanza. No requiere endpoint del backend.
