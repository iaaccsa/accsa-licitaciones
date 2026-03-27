# API Endpoints — service-chunk-and-index

## Variables de runtime

| Variable | Descripción |
|----------|-------------|
| `ANALYSIS_ID` | UUID del análisis en curso |
| `FILE_ID` | UUID del archivo a procesar |

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del análisis.
- **Response:** `{slug, ...}`

### POST /api/v1/files/merged
Obtiene archivos con metadata combinada (incluye datos de proposal). Se filtra localmente por `FILE_ID`.
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{file_record}, ...]`

### PATCH /api/v1/files/{file_id}
Actualiza campos de un archivo.
- **Campos usados:** `total_chunks`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status}`
