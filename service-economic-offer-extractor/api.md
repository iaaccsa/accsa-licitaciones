# API Endpoints -- service-economic-offer-extractor

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis (slug de la coleccion Qdrant).
- **Response:** `{slug, ...}`

### GET /api/v1/proposals/{proposal_id}
Obtiene los datos de la propuesta (label, provider_name) para incluir en el prompt del LLM.
- **Response:** `{id, label, provider_name, matching_status, ...}`

### GET /api/v1/tender-classifications/{analysis_id}
Obtiene el evaluation_profile (contexto no bloqueante: mono/multi-item, moneda esperada, reglas de IVA, formula de ajuste esperada, etc).
- **Response:** `{system_type, factors, enabled_roles, ...}`

### POST /api/v1/proposal-economic-offers/
Upsert de la oferta económica extraida para la propuesta. Si ya existe un registro para ese `proposal_id`, lo reemplaza y resetea el flag `is_verified`.
- **Request:** `{analysis_id, proposal_id, total_amount, currency, includes_taxes, tax_details, payment_terms, validity_days, adjustment_formula, line_items, citations, confidence, reasoning, requires_manual_review, extracted_by, notes}`
- **Response:** `ProposalEconomicOfferRead`

### PATCH /api/v1/proposals/{proposal_id}/economic-start
Transiciona la propuesta al estado `extracting` (track economico) y registra `economic_started_at`.
- **Request:** `{economic_started_at: <ISO timestamp>}`
- **Query params opcional:** `?force=true` para saltear la precondicion sobre `matching_status`.

### PATCH /api/v1/proposals/{proposal_id}/economic-result
Transiciona la propuesta al estado `ready` (track economico) al finalizar con exito.
- **Request:** `{economic_completed_at: <ISO timestamp>}`

### PATCH /api/v1/proposals/{proposal_id}/economic-failure
Transiciona la propuesta al estado `failed` (track economico) en caso de error irrecuperable.
- **Request:** `{economic_completed_at: <ISO timestamp>, economic_error: <string>}`

### POST /api/v1/jobs/callback
Notifica finalizacion del job al orquestador.
- **Request:** `{service_name, analysis_id, status, error_message?}`
