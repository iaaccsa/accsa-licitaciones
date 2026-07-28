# service-requirement-extractor

## Proposito
Extrae todos los requerimientos atomicos del pliego (ya indexado en Qdrant) y los clasifica con un esquema multi-eje (7 ejes), alineado al evaluation_profile detectado previamente por service-tender-classifier.

Los requisitos de admisibilidad se extraen aparte, antes en el pipeline, por `service-admissibility-extractor` y viven en la tabla `admissibility_requirements`. Este servicio puede seguir marcando el rol `admisibilidad_*` en sus propios requerimientos (`analysis_requirements`), pero no los persiste como requisitos de admisibilidad.

## Flujo

1. Carga el evaluation_profile via `GET /api/v1/tender-classifications/{analysis_id}` (exige profile_version=2).
2. Scrollea TODOS los chunks de Qdrant donde `category='tender'`, ordenados por `chunk_index`.
3. Construye batches con ventana deslizante (`BATCH_SIZE=15`, `BATCH_OVERLAP=2`).
4. Procesa batches en paralelo (`MAX_PARALLEL_BATCHES=3`) con OpenAI (fallback: Gemini).
5. Deduplica por SHA1(normalize(texto)).
6. Asigna codigos secuenciales: REQ-001, REQ-002, ...
7. Valida roles y factores contra el evaluation_profile.
8. Guarda via `POST /api/v1/analysis-requirements/bulk`.
9. Notifica finalizacion via callback.

## Clasificacion multi-eje por requerimiento

| Eje | Campo | Descripcion |
|-----|-------|-------------|
| 1 | `roles` | admisibilidad_obligatoria, admisibilidad_subsanable, puntuable, penalizador, informativo, preferencia_legal |
| 2 | `mapped_factors` | referencias a factores del evaluation_profile con peso/formula |
| 3 | `domain` | technical, administrative, legal, financial, hr, logistics, environmental, quality, safety, other |
| 4 | `weight` | tipo/valor/formula/bloque del peso cuantitativo |
| 6 | `verification_method` | attached_document, sworn_statement, external_certificate, inspection, sample, site_visit, auto_verifiable_from_offer, other |
| 7 | `temporal_scope` | at_bid_time, pre_award, during_execution, post_sale, other |
| - | `citations` | referencias al chunk fuente (chunk_id, page, snippet) |

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis
- Requiere: evaluation_profile en `tender_classifications` con `profile_version=2`
- Requiere: chunks en Qdrant con `chunk_index` en el payload

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Scroll de todos los chunks tender con filtros y orden por chunk_index |
| **OpenAI** | Extracción y clasificacion multi-eje (primary) |
| **Gemini** | Fallback si OpenAI falla |
| **Backend API** | Obtener analisis, leer profile, guardar requerimientos, callback |
