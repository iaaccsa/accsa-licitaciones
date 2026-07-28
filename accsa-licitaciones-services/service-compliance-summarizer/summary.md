# service-compliance-summarizer

Calcula las metricas agregadas de cumplimiento de forma determinista y genera el resumen narrativo (`compliance_summary`) mediante una unica llamada al LLM. Toma una propuesta en estado `matrix_ready` o `summary_failed` y la transiciona a `completed`.

Este servicio no modifica la matriz `analysis_compliance_matrix`, no usa Qdrant y no calcula puntaje ponderado.

## Posicion en la pipeline

```
service-compliance-matcher (matrix_ready)
        |
        v
service-compliance-summarizer (completed)
        |
        v
(futuro) scoring-engine
```

## Flujo

1. `PATCH summary-start` - transiciona a `summarizing`.
2. Valida que el estado de la propuesta sea `summarizing`.
3. Carga requerimientos via `GET /api/v1/analysis-requirements/{ANALYSIS_ID}` (paginado, max 500/pagina).
4. Carga la matriz via `GET /api/v1/analysis-compliance-matrix/by-proposal/{PROPOSAL_ID}` (paginado, max 500/pagina).
5. Calcula metricas deterministas (`compliance_rate`, `compliance_counts`, `critical_failures_count`).
6. Selecciona hasta ~25 ejemplos representativos para el prompt.
7. Genera el resumen con una unica llamada al LLM (Gemini primario, OpenAI fallback, hasta 2 reintentos).
8. Valida longitud del resumen (minimo 80 chars, trunca a 3000 chars).
9. `PATCH summary-result` - guarda metricas y resumen, transiciona a `completed`.
10. Notifica al `API_JOBS_CALLBACK`.

En caso de excepcion: `PATCH summary-failure` - `log_event` - notificar callback - `sys.exit(0)`.

## Formula de compliance_rate

```
applicable_total = total - no_aplica
compliance_rate  = ((cumple + 0.5 * cumple_parcial) / applicable_total) * 100
```

`no_aplica` no cuenta en el denominador. `requiere_verificacion_manual` y `no_evidencia` si cuentan (penalizan).

## Variables de entorno (baked en imagen)

`GOOGLE_API_KEY`, `OPENAI_API_KEY`, `API_BASE_URL`, `API_KEY`, `API_EVENTS_PATH`, `API_PROPOSALS_PATH`, `API_ANALYSIS_REQUIREMENTS_PATH`, `API_COMPLIANCE_MATRIX_PATH`, `API_JOBS_CALLBACK`

## Variables de entorno (runtime)

`ANALYSIS_ID`, `PROPOSAL_ID`
