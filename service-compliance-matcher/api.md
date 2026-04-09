# API Endpoints -- service-compliance-matcher

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis (slug de la coleccion Qdrant).
- **Response:** `{slug, ...}`

### GET /api/v1/proposals/{proposal_id}
Obtiene los datos de la propuesta (label, provider_name) para incluir en el prompt del LLM.
- **Response:** `{id, label, provider_name, ...}`

### GET /api/v1/analysis-requirements/{analysis_id}
Obtiene la lista de requerimientos atomicos extraidos por service-requirement-extractor.
- **Query params:** `is_verified` (true/false/none), `domain`, `role`, `factor_id`, `limit`, `offset`
- **Usage:** Llamado con `is_verified=true` para obtener solo requerimientos validados por el usuario.
- **Response:** `[{id, requirement_text, roles, verification_method, domain, is_verified, ...}, ...]`

### GET /api/v1/tender-classifications/{analysis_id}
Obtiene el evaluation_profile producido por service-tender-classifier (contexto, no bloqueante).
- **Response:** `{system_type, factors, enabled_roles, ...}`

### POST /api/v1/analysis-compliance-matrix/bulk
Reemplaza atomicamente todas las entradas de la matriz para el par (analysis_id, proposal_id).
- **Request:** `[{analysis_id, proposal_id, requirement_id, verdict, confidence, reasoning, missing_elements, citations, manual_verification_required, notes}, ...]`
- **Comportamiento:** elimina entradas previas del par (analysis_id, proposal_id) y crea las nuevas en una sola transaccion.

### PATCH /api/v1/proposals/{proposal_id}/matching-start
Transiciona la propuesta al estado `matching` y registra `matching_started_at`.
- **Request:** `{}`

### PATCH /api/v1/proposals/{proposal_id}/matching-result
Transiciona la propuesta al estado `matrix_ready` al finalizar con exito.
- **Request:** `{matching_completed_at: <ISO timestamp>}`

### PATCH /api/v1/proposals/{proposal_id}/matching-failure
Transiciona la propuesta al estado `failed` en caso de error irrecuperable.
- **Request:** `{error_message: <string>}`

### POST /api/v1/jobs/callback
Notifica finalizacion del job al orquestador.
- **Request:** `{service_name, analysis_id, status, error_message?}`
