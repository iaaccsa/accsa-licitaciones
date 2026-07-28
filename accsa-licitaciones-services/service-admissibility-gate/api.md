# API Endpoints -- service-admissibility-gate

## Endpoints consumidos

### GET /api/v1/analyses/{analysis_id}
Obtiene el registro del analisis.
- **Response:** `{id, slug, ...}`

### GET /api/v1/proposals/{proposal_id}
Obtiene los datos de la propuesta (label, matching_status).
- **Response:** `ProposalRead`

### GET /api/v1/analysis-requirements/{analysis_id}
Obtiene los requerimientos de admisibilidad.
- **Query params:** `is_admissibility=true`, `is_verified=true`, `limit`, `offset`
- **Response:** `List[AnalysisRequirementRead]`

### GET /api/v1/analysis-compliance-matrix/by-proposal/{proposal_id}
Obtiene la matriz de cumplimiento de la propuesta (paginada).
- **Query params:** `limit` (default 100), `offset`
- **Response:** `List[ComplianceEntryRead]`

### PATCH /api/v1/proposals/{proposal_id}/admissibility-start
Transiciona `admissibility_status` a `evaluating`.
- **Request:** `{admissibility_started_at: <ISO timestamp>}`

### PATCH /api/v1/proposals/{proposal_id}/admissibility-result
Escribe el veredicto de admisibilidad.
- **Request:** `{admissibility_completed_at, admissibility_status, admissibility_reasons}`

### PATCH /api/v1/proposals/{proposal_id}/admissibility-failure
Marca el gate como fallido por error operativo.
- **Request:** `{admissibility_completed_at, admissibility_error}`

### POST /api/v1/jobs/callback
Notifica finalizacion del job al orquestador.
- **Request:** `{service_name, analysis_id, status, error_message?}`
