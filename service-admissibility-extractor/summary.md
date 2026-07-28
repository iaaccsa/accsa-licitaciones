# service-admissibility-extractor

## Proposito
Extrae los requisitos de admisibilidad (excluyentes) del pliego ya indexado en Qdrant, con un prompt dedicado. No usa el evaluation_profile ni depende de service-tender-classifier: la extraccion general (7 ejes) vive en service-requirement-extractor.

## Flujo

1. Scrollea TODOS los chunks de Qdrant donde `category='tender'`, sobre las colecciones por archivo `FILE_{slug}_{file_id}`, ordenados por filename y luego por `chunk_index`.
2. Construye batches con ventana deslizante (`BATCH_SIZE=15`, `BATCH_OVERLAP=2`).
3. Procesa batches en paralelo (`MAX_PARALLEL_BATCHES=5`) con OpenAI (fallback: Gemini).
4. Aborta si fallan mas del 10% de los batches (`MAX_FAILED_BATCH_RATIO`).
5. Deduplica por SHA1(normalize(texto)).
6. Asigna codigos secuenciales: ADM-001, ADM-002, ...
7. Enriquece las citations con filename y page_number canonicos de Qdrant.
8. Guarda via `POST /api/v1/admissibility-requirements/bulk`.
9. Notifica finalizacion via callback.

Si el pliego no tiene requisitos de admisibilidad el job cierra con `success` y persiste una lista vacia; el corte del pipeline lo aplica la API.

## Clasificacion por requisito

| Campo | Descripcion |
|-------|-------------|
| `roles` | admisibilidad_obligatoria, admisibilidad_subsanable |
| `domain` | technical, administrative, legal, financial, hr, logistics, environmental, quality, safety, other |
| `verification_method` | attached_document, sworn_statement, external_certificate, inspection, sample, site_visit, auto_verifiable_from_offer, other |
| `temporal_scope` | at_bid_time, pre_award, during_execution, post_sale, other |
| `confidence` | alta, media, baja, muy_baja |
| `citations` | referencias al chunk fuente (chunk_id, page_number, filename, snippet) |

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis
- Requiere: chunks en Qdrant con `chunk_index` en el payload
- Requiere: prompt `service-admissibility-extractor/admissibility_extractor` en `service_prompts`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Scroll de todos los chunks tender por archivo, orden por filename + chunk_index |
| **OpenAI** | Extraccion de requisitos de admisibilidad (primary) |
| **Gemini** | Fallback si OpenAI falla |
| **Backend API** | Obtener analisis, cargar prompt, guardar requisitos, registrar costos, callback |
