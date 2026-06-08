# service-admissibility-matcher

## Proposito
Segunda pasada de matching dedicada a **admisibilidad**. Cruza cada requerimiento de la tabla `admissibility_requirements` contra los chunks indexados de una propuesta y escribe los veredictos en `admissibility_results`. Es el gemelo de `compliance-matcher` pero sobre datos 100% separados (tablas propias) y **sin** `evaluation_profile`. Se ejecuta una instancia por propuesta (fan_out_by=proposal) y corre para **todas** las propuestas; el `admissibility-gate` lee `admissibility_results` para decidir admitida/rechazada.

## Flujo

1. Carga el analisis via `GET /api/v1/analyses/{ANALYSIS_ID}` (para el `slug` de Qdrant).
2. Carga la propuesta via `GET /api/v1/proposals/{PROPOSAL_ID}` (label/provider para el prompt).
3. Carga los requerimientos de admisibilidad via `GET {API_ADMISSIBILITY_REQUIREMENTS_PATH}{ANALYSIS_ID}` (paginado, `limit=100`).
4. `DELETE {API_ADMISSIBILITY_RESULTS_PATH}by-proposal/{PROPOSAL_ID}` — borra resultados previos (idempotencia ante re-run).
5. Aplica filtros automaticos sin invocar al LLM:
   - `no_aplica`: roles que son subconjunto de `{informativo, desconocido_pendiente_pliego_general, preferencia_legal}`.
   - `requiere_verificacion_manual`: `verification_method` in (`inspection`, `sample`, `site_visit`).
6. Por cada requerimiento restante, busca RAG en `PROPOSAL_{slug}_{proposal_id}`, recupera `RAG_TOP_K=6` chunks.
7. Evalua cada requerimiento con UNA llamada dedicada al LLM (Gemini `gemini-2.5-flash` primary, OpenAI `gpt-4.1-mini` fallback), paralelizado con `asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS=10)`.
8. Persiste **incrementalmente**: cada veredicto se escribe a `admissibility_results` apenas se resuelve (POST `{...}bulk`). Los auto-filtrados se persisten en batch antes del LLM.
9. Reintentos por requerimiento: hasta `LLM_RETRY_ATTEMPTS=2` con backoff exponencial (`base=1.5`). Si falla todo, degrada a `requiere_verificacion_manual` con `notes=LLM_FAILURE` (no aborta el job).
10. Si ratio de `LLM_FAILURE` supera `MAX_LLM_FAILURE_RATIO=0.20` del total que fue al LLM, el job falla globalmente.
11. Notifica finalizacion via callback (`API_JOBS_CALLBACK`).

## Taxonomia de veredictos

| Veredicto | Descripcion |
|-----------|-------------|
| `cumple` | Evidencia explicita y suficiente de cumplimiento |
| `cumple_parcial` | Cubre parte del requerimiento; `missing_elements` detalla lo que falta |
| `no_cumple` | Evidencia explicita de incumplimiento o contradiccion |
| `no_evidencia` | Los chunks no hablan del tema ni a favor ni en contra |
| `no_aplica` | Auto-filtrado por rol; no corresponde evaluar automaticamente |
| `requiere_verificacion_manual` | Metodo de verificacion exige accion humana o fallo el LLM |

## Caso especial: external_certificate

Si `verification_method == external_certificate` y el LLM devuelve `cumple`, se fuerza `manual_verification_required=true` en post-proceso.

## Diferencias con compliance-matcher

- Lee `admissibility_requirements` (no `analysis_requirements`); escribe `admissibility_results` (no `analysis_compliance_matrix`).
- **No** carga `evaluation_profile` ni filtra por `is_verified`.
- **No** transiciona estado de la propuesta (`matching_start`/`matching_result`). Solo notifica via callback.
- Corre para todas las propuestas (no depende de admisibilidad previa).

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis.
- **PROPOSAL_ID** (runtime): UUID de la propuesta a evaluar.
- Requiere: requerimientos en `admissibility_requirements` para el analisis.
- Requiere: chunks de la propuesta indexados en `PROPOSAL_{slug}_{proposal_id}` (payload con `text`, `chunk_index`, `page_number`, `filename`, `Header 1`).

## Salida
- Filas en `admissibility_results` (una por requerimiento) con `verdict`, `confidence`, `reasoning`, `missing_elements`, `citations`, `manual_verification_required`, `notes`.
- Eventos de log en `events`.

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Busqueda RAG sobre `PROPOSAL_{slug}_{proposal_id}` |
| **Gemini** | Evaluacion por requerimiento (primary) |
| **OpenAI** | Fallback si Gemini falla; embeddings para RAG |
| **Backend API** | Cargar analisis/propuesta/requerimientos, guardar resultados, callback |
