# API Endpoints — service-proposal-scorer

## Endpoints consumidos

### POST /api/v1/proposals/search-with-counts
Busca proposals con conteos de cumplimiento (desde proposals_view).
- **Request:** `{"analysis_id": "uuid"}`
- **Response:** `[{proposal con compliant_count, non_compliant_count, missing_info_count, unprocessable_count}, ...]`

### POST /api/v1/compliance-results/search
Busca resultados de cumplimiento por proposal.
- **Request:** `{"proposal_id": "uuid"}`
- **Response:** `[{compliance_result}, ...]`

### PATCH /api/v1/proposals/{proposal_id}/score
Actualiza score y resumen de un proposal.
- **Request:** `{"compliance_score": number, "compliance_summary": "string"}`

### PATCH /api/v1/analyses/{analysis_id}/status
Actualiza el estado del análisis (usado en caso de fallo).
- **Campos usados:** `status`, `is_success`

### POST /api/v1/jobs/callback
Notifica finalización del job.
- **Request:** `{service_name, analysis_id, status, error_message?}`
