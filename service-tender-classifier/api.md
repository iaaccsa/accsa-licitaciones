# API Endpoints — service-tender-classifier

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis para extraer el `slug` (nombre de coleccion Qdrant).
- **Response:** `{ id, slug, ... }`

### POST /api/v1/tender-classifications/
Crea o actualiza la clasificacion del sistema de evaluacion para un analisis. Upsert por `analysis_id`.
- **Request:**
  ```json
  {
    "analysis_id": "uuid",
    "system_type": "puntos",
    "confidence": "alta",
    "evidence": ["quote1", "quote2"],
    "detected_factors": ["Precio", "Antecedentes"],
    "discarded": { "discarded_types": ["porcentajes"], "reason": "..." },
    "sufficient_chunks": true,
    "additional_chunks_recommendation": null
  }
  ```
- **Response:** `201 Created`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del analisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/events/
Registra eventos de log del servicio.
- **Request:** `{ analysis_id, level, message, source, details? }`

### POST /api/v1/jobs/callback
Notifica finalizacion del job.
- **Request:** `{ service_name, analysis_id, status, error_message? }`
