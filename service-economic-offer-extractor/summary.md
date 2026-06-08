# service-economic-offer-extractor

## Proposito
Extrae la oferta economica estructurada de una propuesta (monto total, moneda, impuestos, plazo de pago, dias de mantenimiento, formula de ajuste parametrico, desglose por items) a partir de los chunks indexados en Qdrant. Se ejecuta una instancia por propuesta (fan_out_by=proposal). El resultado alimenta al `service-scoring-engine` que aplica la formula del pliego.

## Flujo

1. `PATCH /api/v1/proposals/{PROPOSAL_ID}/economic-start` --- transiciona `economic_status` a `extracting`.
2. Carga el analisis via `GET /api/v1/analyses/{ANALYSIS_ID}` (para obtener el slug de Qdrant).
3. Carga la propuesta via `GET /api/v1/proposals/{PROPOSAL_ID}` (label y provider para el prompt).
4. Carga el evaluation_profile via `GET /api/v1/tender-classifications/{ANALYSIS_ID}` (contexto: mono/multi-item, moneda esperada, si el pliego pide IVA incluido, etc). No bloqueante: si no existe, el extractor sigue con defaults.
5. RAG search sobre los chunks de la propuesta en Qdrant (filtro triple: `analysis_id`, `category=proposal`, `proposal_id`). Se lanzan varias queries tematicas (precio total, moneda, impuestos/IVA, plazo de pago, mantenimiento de oferta, formula parametrica, items/lotes) y se deduplican chunks por `chunk_id`. Se recuperan hasta `RAG_TOP_K_PER_QUERY=5` por query, con limite global de `RAG_MAX_TOTAL_CHUNKS=20`.
6. UNA llamada al LLM (Gemini primary, OpenAI fallback) con el conjunto unificado de chunks y el perfil del pliego para extraer una estructura JSON tipada. Reintentos hasta `LLM_RETRY_ATTEMPTS=2` con backoff exponencial.
7. Validacion post-LLM:
   - Normalizar `currency` a mayusculas.
   - Si hay `line_items` y un `total_amount` declarado, comparar la suma de subtotales con el total; si difiere > 1%, setear `requires_manual_review=true` y dejar nota.
   - Si no se pudo extraer `total_amount` ni `line_items`, degradar a `requires_manual_review=true` y `confidence=muy_baja` pero igual persistir el registro.
8. `POST /api/v1/proposal-economic-offers/` con el payload completo (es upsert por `proposal_id`).
9. `PATCH /api/v1/proposals/{PROPOSAL_ID}/economic-result` --- transiciona `economic_status` a `ready`.
10. Notifica finalizacion via callback.

Si algo falla irrecuperablemente: `PATCH .../economic-failure` con el `error_message`, luego `notify_failure`. El servicio **no falla** solo porque la extraccion sea de baja calidad: siempre persiste el mejor intento y marca `requires_manual_review`. Solo fallan los errores operativos (backend caido, Qdrant inaccesible, todos los retries del LLM agotados por errores de red).

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis.
- **PROPOSAL_ID** (runtime): UUID de la propuesta a procesar.
- Requiere: chunks de la propuesta indexados en Qdrant con `category=proposal`, `proposal_id`, `analysis_id`, `chunk_index`, `text`.
- Requiere (opcional pero recomendado): `matching_status` de la propuesta en `completed` (variante A secuencial). El endpoint `economic-start` aplica esta precondicion salvo que se pase `?force=true`.

## Salida
- Una fila en `proposal_economic_offers` (1:1 con la propuesta) con total, moneda, impuestos, plazos, formula, line_items y citas.
- La propuesta queda en `economic_status=ready` con `economic_completed_at` seteado.
- Eventos de log en `events` documentando el total extraido y si requiere revisión manual.

## Configuracion clave (env vars nivel servicio)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `RAG_TOP_K_PER_QUERY` | 5 | Chunks recuperados por query tematica |
| `RAG_MAX_TOTAL_CHUNKS` | 20 | Limite de chunks despues de deduplicar |
| `LLM_RETRY_ATTEMPTS` | 2 | Reintentos del par Gemini->OpenAI por llamada |
| `LLM_RETRY_BACKOFF_BASE` | 1.5 | Base del backoff exponencial |
| `GEMINI_MODEL` | gemini-3.1-pro-preview | Modelo primario |
| `OPENAI_FALLBACK_MODEL` | gpt-5.4 | Modelo fallback |

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Busqueda RAG sobre chunks de la propuesta (`category=proposal`, `proposal_id`, `analysis_id`) |
| **Gemini** | Extraccion estructurada de la oferta economica (primary) |
| **OpenAI** | Fallback + embeddings para RAG (`text-embedding-3-small`) |
| **Backend API** | Cargar analisis/propuesta/profile, upsert de economic offer, transiciones de estado, callback |
