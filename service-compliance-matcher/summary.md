# service-compliance-matcher

## Proposito
Construye la matriz de cumplimiento (`analysis_compliance_matrix`) entre cada requerimiento del pliego y los chunks indexados de una propuesta especifica. Produce un veredicto por requerimiento con razonamiento, citas y flag de verificacion manual. Se ejecuta una instancia por propuesta (en paralelo si hay multiples oferentes).

## Flujo

1. `PATCH /api/v1/proposals/{PROPOSAL_ID}/matching-start` — transiciona a `matching`.
2. Carga el analisis via `GET /api/v1/analyses/{ANALYSIS_ID}`.
3. Carga el evaluation_profile via `GET /api/v1/tender-classifications/{ANALYSIS_ID}` (contexto, no bloqueante).
4. Carga todos los requerimientos via `GET /api/v1/analysis-requirements/{ANALYSIS_ID}`.
5. Aplica filtros automaticos sin invocar al LLM:
   - `no_aplica`: roles `informativo` puro, `desconocido_pendiente_pliego_general`, `preferencia_legal` puro.
   - `requiere_verificacion_manual`: `verification_method` in (`inspeccion`, `muestra`, `visita_tecnica`).
6. Por cada requerimiento restante, busca RAG en Qdrant (`category=proposal`, `proposal_id`, `analysis_id`), recupera `RAG_TOP_K=6` chunks.
7. Evalua cada requerimiento con UNA llamada dedicada al LLM (Gemini primary, OpenAI fallback), paralelizado con `asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS=10)`.
8. Reintentos por requerimiento: hasta `LLM_RETRY_ATTEMPTS=2` con backoff exponencial. Si falla todo, degrada a `requiere_verificacion_manual` (no aborta el job).
9. Si ratio de `LLM_FAILURE` supera el 20% del total que fue al LLM, el job falla globalmente.
10. `POST /api/v1/analysis-compliance-matrix/bulk` con todas las entries.
11. `PATCH /api/v1/proposals/{PROPOSAL_ID}/matching-result` — transiciona a `matrix_ready`.
12. Notifica finalizacion via callback.

## Taxonomia de veredictos

| Veredicto | Descripcion |
|-----------|-------------|
| `cumple` | Evidencia explicita y suficiente de cumplimiento |
| `cumple_parcial` | Cubre parte del requerimiento; `missing_elements` detalla lo que falta |
| `no_cumple` | Evidencia explicita de incumplimiento o contradiccion |
| `no_evidencia` | Los chunks no hablan del tema ni a favor ni en contra |
| `no_aplica` | El requerimiento no corresponde evaluar automaticamente |
| `requiere_verificacion_manual` | Metodo de verificacion exige accion humana o fallo el LLM |

## Caso especial: certificado_externo

Va al LLM pero con instruccion distinta: buscar si el oferente **declara** adjuntar o referenciar el certificado. Si lo declara: `cumple` + `manual_verification_required=true`. Si no hay mencion: `no_evidencia`.

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis
- **PROPOSAL_ID** (runtime): UUID de la propuesta a evaluar
- Requiere: requerimientos en `analysis_requirements`
- Requiere: chunks de la propuesta indexados en Qdrant con `category=proposal`, `proposal_id`, `analysis_id`, `chunk_index`, `text`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Busqueda RAG sobre chunks de la propuesta (filtro triple: analysis_id, category, proposal_id) |
| **Gemini** | Evaluacion de cumplimiento por requerimiento (primary) |
| **OpenAI** | Fallback si Gemini falla; embeddings para RAG |
| **Backend API** | Cargar analisis/propuesta/requerimientos/profile, guardar matriz, transiciones de estado, callback |
