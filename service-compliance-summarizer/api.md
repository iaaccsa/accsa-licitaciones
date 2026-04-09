# API Endpoints - service-compliance-summarizer

## Endpoints consumidos

### PATCH /api/v1/proposals/{proposal_id}/summary-start
Transiciona la propuesta al estado `summarizing` y registra `summarizing_started_at`.
- **Request:** `{ "summarizing_started_at": "<ISO datetime>" }`
- **Error 409:** si la propuesta no esta en estado `matrix_ready` o `summary_failed`.

### GET /api/v1/proposals/{proposal_id}
Obtiene el estado y metadatos de la propuesta.
- **Response:** `{ id, label, provider_name, matching_status, ... }`
- Usado para validar que el estado es `summarizing` antes de procesar.

### GET /api/v1/analysis-requirements/{analysis_id}?limit=500&offset=N
Obtiene los requerimientos atomicos del analisis, paginados.
- **Response:** `[{ id, requirement_code, requirement_text, roles, verification_method, domain, ... }, ...]`
- Indexados en memoria por `id` para resolucion de roles en `compute_metrics` y `select_examples`.
- Paginacion: `limit=500`, se itera hasta que `len(page) < limit`.

### GET /api/v1/analysis-compliance-matrix/by-proposal/{proposal_id}?limit=500&offset=N
Obtiene todas las entradas de la matriz de cumplimiento de la propuesta, paginadas.
- **Response:** `[{ requirement_id, verdict, reasoning, missing_elements, requirement: { ... }, ... }, ...]`
- Tipo: `ComplianceEntryReadWithRequirement` (requirement embebido en cada entrada).
- Paginacion: `limit=500`, se itera hasta que `len(page) < limit`.

### PATCH /api/v1/proposals/{proposal_id}/summary-result
Guarda las metricas y el resumen narrativo. Transiciona la propuesta a `completed`.
- **Request:**
  ```json
  {
    "summarizing_completed_at": "<ISO datetime>",
    "compliance_rate": 78.50,
    "compliance_counts": {
      "cumple": 42, "cumple_parcial": 8, "no_cumple": 5,
      "no_evidencia": 3, "no_aplica": 10, "requiere_verificacion_manual": 2
    },
    "compliance_summary": "<texto plano 3-5 parrafos>",
    "critical_failures_count": 2
  }
  ```

### PATCH /api/v1/proposals/{proposal_id}/summary-failure
Registra el error y transiciona la propuesta a `summary_failed`.
- **Request:** `{ "summarizing_completed_at": "<ISO datetime>", "summary_error": "<string>" }`
- **Nota:** el campo es `summary_error` (no `error_message`). Tambien requiere `summarizing_completed_at`.

### POST /api/v1/jobs/callback
Notifica finalizacion del job al orquestador del backend.
- **Request:** `{ "service_name": "service-compliance-summarizer", "analysis_id": "<uuid>", "status": "success" | "failed", "error_message"?: "<string>" }`
