# Feature 11 — Separación del extractor de requisitos en dos servicios + reordenamiento del pipeline

Complejidad: **alta** (servicio nuevo + reordenamiento del DAG + fases + infra Azure
+ migración de prompt). Toca los 3 proyectos y la DB.

Este documento es **autocontenido**: asume que quien lo implementa no participó de
la conversación de diseño. Todas las decisiones ya están cerradas, **no re-debatir**.

---

## 1. Objetivo

Hoy `service-requirement-extractor` hace **dos extracciones distintas en un solo
job**: la de requisitos de admisibilidad (excluyentes) y la de los demás
requisitos. Se separan en **dos servicios independientes**, y de paso el pipeline
se reordena para que la admisibilidad se resuelva **antes** de gastar cómputo en
el resto.

Ganancias buscadas:
- Cada extractor se itera, se despliega y se le edita el prompt por separado.
- Si ninguna propuesta pasa admisibilidad, no se corre la extracción de otros
  requisitos ni el matching de cumplimiento (ahorro de cómputo LLM).
- El extractor de admisibilidad queda alineado con el del laboratorio, que es
  donde se itera y se mide el prompt.

---

## 2. Estado actual (verificado)

### 2.1 El servicio combinado

`accsa-licitaciones-services/service-requirement-extractor/main.py` (1726 líneas).
Por cada batch de chunks corre **dos pasadas LLM secuenciales** en `extract_batch`
(línea 1053):

| | Pasada A (admisibilidad) | Pasada B (general) |
|---|---|---|
| Prompt | `service-requirement-extractor/admissibility_extractor` | `service-requirement-extractor/requirements_extractor` |
| Input extra | ninguno | `evaluation_profile` de tender-classifier (exige `profile_version=2`) |
| Modelo pydantic | `AdmissibilityBatchResponse` | `BatchResponse` (7 ejes) |
| Post-proceso | dedup → códigos `ADM-nnn` | dedup → `REQ-nnn` → `validate_against_profile` |
| Persistencia | `POST /api/v1/admissibility-requirements/bulk` | `POST /api/v1/analysis-requirements/bulk` |
| Si falla | no cuenta como batch fallido, el job igual termina OK | cuenta; >10% batches fallidos aborta el job |

Comparten: scroll de Qdrant sobre colecciones `FILE_{slug}_{file_id}` de archivos
`category='tender'`, batching (`BATCH_SIZE=15`, `BATCH_OVERLAP=2`), `ThreadPoolExecutor`
de 5, fallback OpenAI → Gemini (`_run_llm_pass`, línea 893), `resolve_model_config()`,
registro de costos con `record_usage`, eventos y enriquecimiento de citations.

### 2.2 DAG actual

`accsa-licitaciones-api/app/config/pipeline_config.json`:

```
documents_grouper [pause]
  ├─ tender_classifier → requirement_extraction [pause] → admissibility_matcher
  └─ build_proposal_index (next_services vacío)
                                                 admissibility_matcher
                                                   → admissibility_gate [pause]
                                                     → compliance_matcher
                                                       → compliance_summarizer
                                                       → economic_offer_extractor
```

### 2.3 Mecánica de orquestación relevante

`accsa-licitaciones-api/app/services/job_orchestrator_service.py`:
- `on_job_completed` (129): actualiza job, completa el workflow step de forma
  atómica, evalúa `pause_after`, aplica el corte de "sin propuestas admitidas"
  (222) y lanza los `next_services`.
- Pausa: setea `analyses.status = "awaiting_approval"` y
  `analyses.paused_at_service = <servicio>` (206). Son **escalares**: solo puede
  haber una aprobación pendiente a la vez.
- `resume_pipeline` (472): lanza `get_next_jobs(paused_at_service)`.
- `_complete_downstream_and_finalize` (584): autocompleta con 0 instancias todos
  los jobs aguas abajo, marca el análisis `ready` / `is_success=true` y manda el
  email de "completado".
- `build_service_env` (360) + `SERVICE_API_PATHS` (27): la imagen no lleva
  configuración; el orquestador inyecta las ~20 variables de entorno en cada job.
  **Un servicio nuevo no necesita cambios acá**: ya recibe todo lo que usa.
- Imagen que se lanza: `f"{AZURE_CONTAINER_REGISTRY}/{service_name}:latest"`, con
  `AZURE_CONTAINER_REGISTRY=accsalicitaciones.azurecr.io/services`.

### 2.4 Prompts

Tabla `service_prompts` en Supabase. `global/prompt_loader.py` los baja en runtime
por key (`GET /api/v1/prompts/{key}`), sin fallback: si falla, el job falla.
La pantalla `/admin/config/prompts` (`accsa-licitaciones-ui/src/app/admin/config/prompts/page.tsx`)
es 100% data-driven: arma las tarjetas desde las filas, agrupando por la columna
`service`. **No hay catálogo hardcodeado en la UI.**

### 2.5 Fases

`accsa-licitaciones-api/app/config/phases_config.json`: lista ordenada 1..7.
`workflow_phase_service.update_phase_progress` (44) activa la fase siguiente
cuando es de tipo `approval` y la fase de proceso anterior se completó.

---

## 3. Decisiones cerradas

1. **Dos servicios independientes.** Nuevo `service-admissibility-extractor`
   (31 caracteres, entra en el límite de 32 de ACA Jobs).
   `service-requirement-extractor` **conserva su nombre** y se queda solo con la
   extracción general.
2. **Pipeline lineal**, una sola pausa activa a la vez. Orden pedido:
   extracción de admisibilidad → pausa de aprobación → evaluación de
   admisibilidad por propuesta → pausa de aprobación → extracción de otros
   requisitos → pausa de aprobación → evaluación contra propuestas admitidas.
3. **`service-build-proposal-index` entra en la cadena** entre el extractor de
   admisibilidad y el matcher (`admissibility_extractor → build_proposal_index →
   admissibility_matcher`). Así no hay carreras: el índice por propuesta siempre
   está listo antes del matcher.
4. **Cero dependencias entre los dos servicios nuevos.** Se duplica el andamiaje
   común (scroll, batching, retries, dedup). Nada se sube a `global/`.
5. **Si la extracción de admisibilidad falla, falla el pipeline** (es el
   comportamiento por defecto de cualquier job: `status="failed"` en el callback).
6. **Si extrae cero requisitos, NO falla**: se cortan los jobs restantes, el
   análisis queda `ready` / `is_success=true` y se registra un evento. Cómo se
   muestra eso en la interfaz queda para otro feature, ya anotado en
   `features/backlog/analisis-sin-requisitos-admisibilidad.md`.
7. **Corte de cómputo confirmado**: si ninguna propuesta queda admitida tras el
   gate, no se corren tender-classifier, extracción de otros requisitos ni
   compliance. Esto sale gratis con el reordenamiento (el corte ya existe en
   `on_job_completed:222`), pero ahora saltea mucho más.
8. **Modelo LLM: como hoy.** `resolve_model_config()` lee la config global por
   análisis y se **mantiene el fallback a Gemini**. Esta es la única desviación
   deliberada respecto del servicio del laboratorio (que es OpenAI-only).
9. **El servicio nuevo debe ser lo más parecido posible** a
   `accsa-admissibility-lab/services/lab-service-requirement-extractor/main.py`.
   Ver sección 5.

---

## 4. DAG y fases nuevos

### 4.1 `pipeline_config.json` (contenido completo, reemplaza el archivo)

Cambios respecto del actual, para revisar el diff con criterio:
- `documents_grouper.next_services`: `["service-tender-classifier", "service-build-proposal-index"]` → `["service-admissibility-extractor"]`
- entrada nueva `service-admissibility-extractor`
- `build_proposal_index`: `parent` `documents_grouper` → `admissibility_extraction`; `next_services` `[]` → `["service-admissibility-matcher"]`; `phase` `requirement_extraction` → `award_check`
- `admissibility_matcher.parent`: `requirement_extraction` → `build_proposal_index`
- `admissibility_gate.next_services`: `["service-compliance-matcher"]` → `["service-tender-classifier"]`
- `tender_classifier.parent`: `documents_grouper` → `admissibility_gate`
- `requirement_extraction.next_services`: `["service-admissibility-matcher"]` → `["service-compliance-matcher"]`; `display_name` → `"Extracción de Otros Requisitos"`
- `compliance_matcher.parent`: `admissibility_gate` → `requirement_extraction`

```json
[
  {
    "service": "service-queue",
    "next_services": [],
    "code": "queue",
    "display_name": "En Espera",
    "parent": null,
    "initial_status": "completed",
    "is_initial": true,
    "is_final": false,
    "pause_after": false,
    "phase": "document_processing"
  },
  {
    "service": "service-file-extractor",
    "next_services": ["service-files-converter-mistral"],
    "code": "extractor",
    "display_name": "Extracción de Archivos",
    "parent": "queue",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "phase": "document_processing"
  },
  {
    "service": "service-files-converter-mistral",
    "next_services": ["service-qdrant-by-file"],
    "code": "converter",
    "display_name": "Preparación de Documentos",
    "parent": "extractor",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "phase": "document_processing"
  },
  {
    "service": "service-qdrant-by-file",
    "next_services": [
      "service-file-metadata-extractor",
      "service-digital-sig-extractor"
    ],
    "code": "qdrant_by_file",
    "display_name": "Indexación de Documentos",
    "parent": "converter",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "processed_file",
    "phase": "document_processing"
  },
  {
    "service": "service-file-metadata-extractor",
    "next_services": ["service-documents-classifier"],
    "code": "file_metadata_extractor",
    "display_name": "Extracción de Metadatos",
    "parent": "qdrant_by_file",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "processed_file",
    "phase": "document_processing"
  },
  {
    "service": "service-digital-sig-extractor",
    "next_services": ["service-documents-classifier"],
    "code": "digital_signature_extractor",
    "display_name": "Extracción de Firmas Digitales",
    "parent": "qdrant_by_file",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "original_file",
    "phase": "document_processing"
  },
  {
    "service": "service-documents-classifier",
    "next_services": ["service-documents-grouper"],
    "code": "documents_classifier",
    "display_name": "Clasificación de Documentos",
    "parent": "file_metadata_extractor",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "file_with_metadata",
    "phase": "document_processing"
  },
  {
    "service": "service-documents-grouper",
    "next_services": ["service-admissibility-extractor"],
    "code": "documents_grouper",
    "display_name": "Agrupación de Documentos",
    "parent": "documents_classifier",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": true,
    "phase": "document_processing"
  },
  {
    "service": "service-admissibility-extractor",
    "next_services": ["service-build-proposal-index"],
    "code": "admissibility_extraction",
    "display_name": "Extracción de Requisitos de Admisibilidad",
    "parent": "documents_grouper",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": true,
    "phase": "admissibility_extraction"
  },
  {
    "service": "service-build-proposal-index",
    "next_services": ["service-admissibility-matcher"],
    "code": "build_proposal_index",
    "display_name": "Indexación por Propuesta",
    "parent": "admissibility_extraction",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "proposal",
    "phase": "award_check"
  },
  {
    "service": "service-admissibility-matcher",
    "next_services": ["service-admissibility-gate"],
    "code": "admissibility_matcher",
    "display_name": "Match de Admisibilidad",
    "parent": "build_proposal_index",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "proposal",
    "phase": "award_check"
  },
  {
    "service": "service-admissibility-gate",
    "next_services": ["service-tender-classifier"],
    "code": "admissibility_gate",
    "display_name": "Chequeo de Admisibilidad",
    "parent": "admissibility_matcher",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": true,
    "fan_out_by": "proposal",
    "phase": "award_check"
  },
  {
    "service": "service-tender-classifier",
    "next_services": ["service-requirement-extractor"],
    "code": "tender_classifier",
    "display_name": "Determinación Sistema de Evaluación",
    "parent": "admissibility_gate",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "phase": "requirement_extraction"
  },
  {
    "service": "service-requirement-extractor",
    "next_services": ["service-compliance-matcher"],
    "code": "requirement_extraction",
    "display_name": "Extracción de Otros Requisitos",
    "parent": "tender_classifier",
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": true,
    "phase": "requirement_extraction"
  },
  {
    "service": "service-compliance-matcher",
    "next_services": [
      "service-compliance-summarizer",
      "service-economic-offer-extractor"
    ],
    "code": "compliance_matcher",
    "display_name": "Matcher de Cumplimiento",
    "parent": "requirement_extraction",
    "require_admitida": true,
    "initial_status": "pending",
    "is_initial": false,
    "is_final": false,
    "pause_after": false,
    "fan_out_by": "proposal",
    "phase": "final_compliance_check"
  },
  {
    "service": "service-compliance-summarizer",
    "next_services": [],
    "code": "compliance_summarizer",
    "display_name": "Resumen de Cumplimiento",
    "parent": "compliance_matcher",
    "require_admitida": true,
    "initial_status": "pending",
    "is_initial": false,
    "is_final": true,
    "pause_after": false,
    "fan_out_by": "proposal",
    "phase": "final_compliance_check"
  },
  {
    "service": "service-economic-offer-extractor",
    "next_services": [],
    "code": "economic_offer_extractor",
    "display_name": "Extracción de Oferta Económica",
    "parent": "compliance_matcher",
    "require_admitida": true,
    "initial_status": "pending",
    "is_initial": false,
    "is_final": true,
    "pause_after": false,
    "fan_out_by": "proposal",
    "phase": "final_compliance_check"
  }
]
```

### 4.2 `phases_config.json` (contenido completo, reemplaza el archivo)

Se agregan dos fases (`admissibility_extraction` y `admissibility_req_approval`)
y se reordena el resto. `requirement_extraction` pasa de orden 3 a 7.

```json
[
  {
    "code": "document_processing",
    "display_name": "Procesamiento de Documentos",
    "order": 1,
    "type": "processing"
  },
  {
    "code": "doc_approval",
    "display_name": "Esperando Aprobación de Documentos",
    "order": 2,
    "type": "approval"
  },
  {
    "code": "admissibility_extraction",
    "display_name": "Extracción de Requisitos de Admisibilidad",
    "order": 3,
    "type": "processing"
  },
  {
    "code": "admissibility_req_approval",
    "display_name": "Esperando Aprobación de Requisitos de Admisibilidad",
    "order": 4,
    "type": "approval"
  },
  {
    "code": "award_check",
    "display_name": "Chequeo de Admisibilidad",
    "order": 5,
    "type": "processing"
  },
  {
    "code": "award_approval",
    "display_name": "Esperando Aprobación de Admisibilidad",
    "order": 6,
    "type": "approval"
  },
  {
    "code": "requirement_extraction",
    "display_name": "Extracción de Otros Requisitos",
    "order": 7,
    "type": "processing"
  },
  {
    "code": "requirement_approval",
    "display_name": "Esperando Aprobación de Requisitos",
    "order": 8,
    "type": "approval"
  },
  {
    "code": "final_compliance_check",
    "display_name": "Chequeo Final",
    "order": 9,
    "type": "processing"
  }
]
```

Notas:
- `_auto_approval_label` (workflow_phase_service.py:10) reemplaza
  `"Esperando Aprobación de "` por `"Sin aprobación: "` cuando `hitl=false`. El
  display_name nuevo respeta ese prefijo, así que funciona sin tocar nada.
- Los análisis viejos guardan su propio `order` y `display_name` en la tabla
  `workflow_phases`, así que siguen renderizando consistentes con su corrida.
- Que el código de fase `admissibility_extraction` coincida con el código de step
  `admissibility_extraction` no es problema: hoy ya pasa lo mismo con
  `requirement_extraction`.

---

## 5. Servicio nuevo: `service-admissibility-extractor`

Carpeta: `accsa-licitaciones-services/service-admissibility-extractor/`

### 5.1 Regla de construcción

**Punto de partida: copiar
`accsa-admissibility-lab/services/lab-service-requirement-extractor/main.py`**
y aplicarle solo los cambios de 5.3. No partir del servicio de prod y podarlo:
el del lab ya es admisibilidad-only y es el que se usa para iterar el prompt.

### 5.2 Se copia tal cual del lab (verificado línea por línea)

- `_strip_accents`, `_make_normalizer` y **todos** los mapas de alias, con el
  recorte del lab: `ROLE_ALIASES` / `ROLE_ALLOWED` solo contienen
  `admisibilidad_obligatoria` y `admisibilidad_subsanable`. **No** copiar los
  alias de los otros 5 roles ni `WEIGHT_TYPE_ALIASES` / `BLOCK_ALIASES`, que son
  del esquema general.
- `CONFIDENCE_ORDER`, `RequirementCitation`, `_drop_uncited_requirements`.
- `AdmissibilityRawRequirement`, `AdmissibilityBatchResponse`,
  `FinalAdmissibilityRequirement`.
- `scroll_all_chunks`, `make_batches`, `build_admissibility_user_prompt`.
- `_is_provider_unavailable`, `_is_malformed_response`, `_count_raw_requirements`,
  `_log_dropped_uncited`, `_call_with_retry`.
- `normalize_text`, `_confidence_rank`, `_best_by_confidence`,
  `deduplicate_admissibility`, `assign_codes_admissibility` (códigos `ADM-nnn`).
- Constantes: `BATCH_SIZE=15`, `BATCH_OVERLAP=2`, `MAX_PARALLEL_BATCHES=5`,
  `SCROLL_PAGE_SIZE=256`, `MAX_FAILED_BATCH_RATIO=0.10`, `MAX_LLM_RETRIES=3`,
  `LLM_RETRY_BASE_DELAY=1.0`, `PROVIDER_UNAVAILABLE_STATUS_CODES`,
  `UNAVAILABLE_MAX_ATTEMPTS=2`, `UNAVAILABLE_RETRY_DELAY=10.0`.
- La estructura de `process_extraction` (slug → scroll → batches → pool →
  umbral de fallos → dedup → códigos → enriquecimiento de citations → persistir →
  evento resumen) y el shape del evento resumen.

### 5.3 Diferencias respecto del lab (obligatorias)

| Tema | Lab | Servicio nuevo |
|------|-----|----------------|
| `SERVICE_NAME` | `lab-service-requirement-extractor` | `service-admissibility-extractor` |
| Colección Qdrant | `LAB-FILE_{slug}_{file_id}` | `FILE_{slug}_{file_id}` |
| Prompt | `GET /runs/{run_id}/prompt` | `load_prompt("service-admissibility-extractor/admissibility_extractor")` de `global/prompt_loader.py` |
| Modelo | `MODEL` por corrida, OpenAI only | `resolve_model_config()` + fallback a Gemini (copiar `_run_llm_pass` de `service-requirement-extractor/main.py:893`, invocándolo una sola vez con `AdmissibilityBatchResponse`) |
| Costos | tokens reportados al backend del lab | `load_pricing()` en `main()` + `record_usage(...)` dentro de `_run_llm_pass`, igual que prod |
| Persistencia | `POST /runs/{id}/requirements/bulk` | `POST {API_ADMISSIBILITY_REQUIREMENTS_PATH}bulk?analysis_id=<id>` con `[r.model_dump() for r in reqs]` (idéntico a `post_admissibility_bulk` de prod, línea 1448). El endpoint hace replace: borra e inserta. |
| Cierre OK | `close_run_success` | `POST {API_JOBS_CALLBACK}` con `{"service_name": SERVICE_NAME, "analysis_id": ANALYSIS_ID, "status": "success"}` |
| Cierre error | `fail_run` | `notify_failure` de prod (línea 600): evento `error`, `PATCH analyses/{id}/status` a `ready`/`is_success=false`, callback con `status: "failed"`, y `sys.exit(0)` |
| Env vars | `RUN_ID`, `MODEL`, `REASONING_EFFORT`, `API_RUNS_PATH` | no existen |

Env vars que valida (`validate_env`) y que el orquestador ya inyecta:
`GOOGLE_API_KEY`, `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`,
`API_BASE_URL`, `API_KEY`, `API_EVENTS_PATH`, `API_ANALYSES_PATH`,
`API_PROCESSED_FILES_PATH`, `API_ADMISSIBILITY_REQUIREMENTS_PATH`,
`API_JOBS_CALLBACK`, `ANALYSIS_ID`.
(`API_PROMPTS_PATH`, `API_PRICING_PATH` y `API_USAGE_PATH` los leen los módulos
de `global/`, no hace falta validarlos acá.)

**No debe existir** en este servicio: `evaluation_profile`,
`get_evaluation_profile`, `validate_against_profile`, `API_TENDER_CLASSIFICATIONS_PATH`,
`API_ANALYSIS_REQUIREMENTS_PATH`, ni ninguna referencia a
`service-tender-classifier`.

### 5.4 Caso "cero requisitos"

El servicio **no** decide el corte: persiste lo que haya (aunque sea lista vacía,
o directamente no llama al bulk si está vacía, igual que hoy hace prod en la
línea 1627), loguea el evento resumen y cierra con `status: "success"`.
El corte lo aplica la API (sección 7.2).

Igual que en el lab, si `scroll_all_chunks` devuelve 0 chunks se loguea un
warning y se cierra con success (después la API corta por 0 requisitos).

### 5.5 Archivos de la carpeta

- `main.py` — lo anterior.
- `requirements.txt` — mismo contenido que `service-requirement-extractor/requirements.txt`:
  `qdrant-client>=1.7.0`, `google-genai>=1.0.0`, `openai>=1.0.0`, `pydantic>=2.0.0`,
  `requests>=2.28.0` (google-genai sigue haciendo falta por el fallback).
- `Dockerfile` — copia del de `service-requirement-extractor` cambiando las dos
  rutas `COPY`. Copia `VERSION`, `global/supabase_logger.py`,
  `global/ai_usage_logger.py`, `global/prompt_loader.py` y el `main.py` propio.
  El build context es la raíz de `accsa-licitaciones-services/`.
- `build-and-push.sh` — copia del de `service-requirement-extractor` con
  `APP_NAME="service-admissibility-extractor"`.
- `summary.md` — descripción del servicio siguiendo el formato de los otros
  `summary.md`.

---

## 6. Cambios en `service-requirement-extractor`

Queda **solo con la extracción general**. Todo lo de admisibilidad se borra
(no se comenta, se borra). Referencias por línea del archivo actual:

- Docstring (1-24): sacar la mención a la extracción de admisibilidad y a
  `API_ADMISSIBILITY_REQUIREMENTS_PATH`.
- Config: borrar `API_ADMISSIBILITY_REQUIREMENTS_PATH` (64-66) y su entrada en
  `validate_env` (586-589).
- Modelos: borrar `AdmissibilityRole` (453), `AdmissibilityRawRequirement`
  (456-493), `AdmissibilityBatchResponse` (496-502),
  `FinalAdmissibilityRequirement` (505-506).
- Prompts: borrar `ADMISSIBILITY_SYSTEM_PROMPT` (517) y su `load_prompt` en
  `main()` (1709).
- Borrar `build_admissibility_user_prompt` (762-773).
- `BatchOutcome` (823-841): borrar el campo `admissibility_requirements`, borrar
  `admissibility_failure_reason`, renombrar `general_failure_reason` a
  `failure_reason` y borrar la property de compatibilidad. Actualizar los usos en
  1538, 1549 y 1647.
- `extract_batch` (1053-1129): borrar el bloque completo de la Pasada A
  (1063-1095) y su acumulación de flags. Queda solo la Pasada B.
- Borrar `deduplicate_admissibility` (1234-1289),
  `assign_codes_admissibility` (1314-1327) y `post_admissibility_bulk` (1448-1458).
- `process_extraction`: borrar `raw_admissibility_results` (1520), el `extend`
  (1542-1543), la mención en el log de 1552-1556, el paso 7 completo (1608-1623),
  el `post_admissibility_bulk` (1627-1630) y los campos de admisibilidad del
  resumen (1661, 1673, 1675).
- `_run_llm_pass` se conserva tal cual (ahora con una sola invocación, label
  `"general"`).

Sigue leyendo el `evaluation_profile` y validando contra el perfil: eso no cambia.

**Fuera de alcance:** que la extracción general siga produciendo requisitos con
roles `admisibilidad_obligatoria` / `admisibilidad_subsanable` dentro de
`analysis_requirements` es el comportamiento actual y **no se toca** en este
feature.

---

## 7. Cambios en la API

### 7.1 Config

Reemplazar `app/config/pipeline_config.json` y `app/config/phases_config.json`
con el contenido de la sección 4. No hace falta tocar `jobs_config.py`: lee todo
del JSON.

### 7.2 Corte por cero requisitos de admisibilidad

En `app/services/job_orchestrator_service.py`, dentro de `on_job_completed`,
**después** del bloque que reclama y completa el workflow step (línea 184-189) y
**antes** del bloque de `should_pause` (191). El orden importa: si no hay
requisitos no tiene sentido pausar esperando que el usuario apruebe una lista
vacía.

```python
if service_name == "service-admissibility-extractor" and not admissibility_requirement_repository.get_by_analysis_id(str(analysis_id), limit=1):
    self._log_event(
        analysis_id, "info",
        "No se extrajeron requisitos de admisibilidad del pliego: se omiten los jobs restantes y se finaliza el análisis.",
        {"admissibility_requirement_count": 0},
    )
    self._complete_downstream_and_finalize(analysis_id, service_name)
    return []
```

Import a agregar arriba:
```python
from app.repositories.admissibility_requirement_repository import admissibility_requirement_repository
```

`_complete_downstream_and_finalize` ya hace todo lo demás: autocompleta los steps
aguas abajo con 0 instancias, marca el análisis `ready` / `is_success=true` y
manda el email de "completado". Que además dispare `apply_admissibility_cut`
(pinta `award_check` como warning y deja `final_compliance_check` en pending) se
acepta tal cual; refinarlo es parte del feature de backlog.

### 7.2b Corte por ninguna admitida en `resume_pipeline` (hallazgo, agregado)

El corte de la decisión 7 **no se da solo** con el reordenamiento. En
`on_job_completed` el bloque de `should_pause` hace `return []` **antes** del
corte de la línea 222, así que con `hitl=true` (el default) el gate pausa y ese
corte nunca corre; y `resume_pipeline` no chequea admitidas.

Hoy no se nota porque `admissibility_gate → compliance_matcher` es un fan-out con
`require_admitida`, que con 0 items se autocompleta en cascada. Con el DAG nuevo
`admissibility_gate → tender_classifier` es un nodo común, así que sin este
chequeo se correrían igual tender-classifier y la extracción general — justo el
cómputo que el feature quiere ahorrar (y §14.8 fallaría).

En `resume_pipeline`, después de limpiar el estado de pausa y antes de lanzar los
`next_jobs`:

```python
if paused_at_service == "service-admissibility-gate" and not proposal_repository.get_admitidas_by_analysis_id(analysis_id):
    self._log_event(
        analysis_id, "info",
        "Sin propuestas admitidas tras el chequeo de admisibilidad: se omiten los jobs restantes y se finaliza el análisis.",
        {"admitidas": 0}
    )
    self._complete_downstream_and_finalize(analysis_id, paused_at_service)
    return []
```

### 7.3 Lo que NO cambia en la API

- Endpoints, repos, schemas y servicios de `admissibility_requirements`: ya
  existen y sirven igual.
- `build_service_env` / `SERVICE_API_PATHS`: el servicio nuevo ya recibe todas
  las variables que usa.
- `resume_pipeline`: sigue funcionando porque el pipeline es lineal y
  `paused_at_service` alcanza.

---

## 8. Prompts

### 8.1 Migración de la fila (vía MCP Supabase)

Preserva el `body` ya editado. Verificar primero que la fila exista:

```sql
select key, service, filename, title from service_prompts
where key = 'service-requirement-extractor/admissibility_extractor';
```

```sql
update service_prompts
set key = 'service-admissibility-extractor/admissibility_extractor',
    service = 'service-admissibility-extractor'
where key = 'service-requirement-extractor/admissibility_extractor';
```

`filename` (`prompt_admissibility_extractor.md`), `title`, `description` y
`required_placeholders` (vacío) quedan igual.

### 8.2 Seed script

En `accsa-licitaciones-services/scripts/seed_prompts.py`, la entrada de
`service-requirement-extractor/admissibility_extractor` (líneas 63-70) pasa a:

```python
    {
        "key": "service-admissibility-extractor/admissibility_extractor",
        "service": "service-admissibility-extractor",
        "filename": "prompt_admissibility_extractor.md",
        "title": "Extractor de admisibilidad",
        "description": "Extrae requisitos de admisibilidad del pliego.",
        "required_placeholders": [],
    },
```

### 8.3 UI de prompts

No requiere cambios. `/admin/config/prompts` arma las tarjetas desde las filas de
la tabla, así que la tarjeta pasa a mostrar el servicio nuevo sola.

---

## 9. Cambios en la UI

Único cambio funcional: el indicador de aprobación pendiente de la tarjeta
"Requisitos de Admisibilidad".

- `accsa-licitaciones-ui/src/app/analyses/[id]/page.tsx:341`:
  `analysis.paused_at_service === "service-requirement-extractor"` →
  `analysis.paused_at_service === "service-admissibility-extractor"`.

Se dejan como están (siguen siendo correctos):
- `page.tsx:317` y `files/page.tsx:314` → `service-documents-grouper`.
- `page.tsx:364` y `proposals/[proposalId]/page.tsx:316` → `service-admissibility-gate`.
- `page.tsx:386` (tarjeta "Otros Requisitos") → `service-requirement-extractor`.

El árbol de workflow (`WorkflowVisualization`) y las fases son data-driven: el
nodo nuevo y las fases nuevas aparecen solos.

Efecto colateral esperado: ahora hay **4 pausas** por análisis en vez de 3, así
que se manda un email de `awaiting_approval` más. No hay cambios en el template.

---

## 10. Infraestructura Azure

1. `accsa-licitaciones-services/azure-pipelines.yml`: agregar al `matrix`
   ```yaml
       service-admissibility-extractor:
         SERVICE_NAME: "service-admissibility-extractor"
   ```
2. `accsa-licitaciones-services/create-azure-container-app-job.sh`: agregar
   `"service-admissibility-extractor"` a `VALID_SERVICES`.
3. Crear el ACA Job (una sola vez, requiere `az login`):
   ```bash
   cd accsa-licitaciones-services
   ./create-azure-container-app-job.sh service-admissibility-extractor
   ```
   El job se crea apuntando a
   `accsalicitaciones.azurecr.io/services/service-admissibility-extractor:latest`,
   que es exactamente la imagen que el orquestador lanza.
4. `jobs.sh` tiene una lista vieja y desactualizada de servicios; no se usa para
   esto, no hace falta tocarlo.

---

## 11. Documentación y versión

- `CLAUDE.md` (raíz): actualizar el diagrama de "System Pipeline".
- `accsa-licitaciones-services/CLAUDE.md`: diagrama + fila nueva en la tabla de
  servicios.
- `accsa-licitaciones-api/CLAUDE.md`: diagrama de "Jobs Pipeline Architecture".
- `service-requirement-extractor/summary.md` y `api.md`: sacar lo de
  admisibilidad.
- `service-admissibility-extractor/summary.md`: nuevo.
- Changelog unificado: agregar entrada en `accsa-licitaciones-ui/CHANGELOG.md`
  siguiendo `accsa-licitaciones-ui/RELEASING.md` (versión actual 2.1.0).

---

## 12. Plan por fases

Marcar `[x]` al avanzar. Implementar paso por paso.

### Fase 0 — Servicio nuevo
- [x] Crear `service-admissibility-extractor/` con `main.py`, `Dockerfile`,
      `requirements.txt`, `build-and-push.sh`, `summary.md` (secciones 5.1-5.5).
- [x] `python -m py_compile main.py` limpio (y pyflakes sin hallazgos).
- [ ] `./build-and-push.sh local` construye sin errores. **Sin verificar**: el
      daemon de Docker no estaba corriendo.

### Fase 1 — Podar el servicio viejo
- [x] Aplicar todas las eliminaciones de la sección 6.
- [x] `python -m py_compile main.py` limpio (pyflakes: solo los 3 imports sin uso
      que ya existían antes del cambio — `Path`, `Union`, `qdrant models`).
- [x] Verificar que no queda ninguna aparición de `admissibility` /
      `Admissibility` en `service-requirement-extractor/main.py`. Quedan a
      propósito los roles `admisibilidad_*` (fuera de alcance, sección 6).
- [ ] `./build-and-push.sh local` construye sin errores. **Sin verificar**: el
      daemon de Docker no estaba corriendo.

### Fase 2 — API
- [x] Reemplazar `pipeline_config.json` (4.1).
- [x] Reemplazar `phases_config.json` (4.2).
- [x] Corte por cero requisitos en `on_job_completed` (7.2).
- [x] Corte por ninguna admitida en `resume_pipeline` (7.2b).
- [x] Levantar la API y verificar que arranca (`jobs_config.py` parsea los JSON
      en import time: un JSON mal formado rompe el arranque). `app.main` importa
      OK; DAG validado: 16 jobs, todos alcanzables, 1 solo fan-in
      (documents-classifier), 4 pausas, fases monótonas 1→9.

### Fase 3 — Prompts
- [ ] Ejecutar el `update` de 8.1 vía MCP Supabase. **Pendiente a propósito**:
      apenas corre, la imagen vieja del extractor combinado ya no puede cargar su
      prompt. Va pegado al deploy (sección 13, paso 3). Fila verificada: existe,
      `service-requirement-extractor/admissibility_extractor`, body de 5960 chars.
- [x] Actualizar `seed_prompts.py` (8.2).
- [ ] `GET /api/v1/prompts/service-admissibility-extractor/admissibility_extractor`
      devuelve el body.

### Fase 4 — UI
- [x] Cambiar `page.tsx:341` (sección 9).
- [x] `pnpm build` limpio.

### Fase 5 — Infra
- [x] `azure-pipelines.yml` + `create-azure-container-app-job.sh` (10.1, 10.2).
- [ ] Crear el ACA Job (10.3). **Pendiente**: va después del push de la imagen
      (sección 13, pasos 1-2), que no se pudo hacer sin Docker.

### Fase 6 — Deploy
Orden importante, ver sección 13.
- [ ] Push de las dos imágenes a ACR.
- [ ] Deploy de la API.
- [ ] Deploy de la UI (Vercel).

### Fase 7 — Docs
- [x] Los 6 puntos de la sección 11. Nota: `service-requirement-extractor/api.md`
      no tenía nada de admisibilidad que sacar, y en `summary.md` lo único que
      quedaba era el rol `admisibilidad_*` de la tabla de ejes (correcto); se le
      agregó un puntero al servicio nuevo.

### Fase 8 — Verificación end to end
- [ ] Sección 14.

---

## 13. Orden de deploy y riesgo de análisis en vuelo

**No deployar con análisis en curso.** Los `workflow_steps` se crean al iniciar
el análisis a partir de `pipeline_config.json`; si la config cambia en el medio,
un análisis viejo no tiene la fila del step nuevo y `start_step_by_code`
(un UPDATE) no la crea. Drenar el pipeline antes: sin análisis en `processing`
ni en `awaiting_approval`.

Orden:
1. Build + push de `service-admissibility-extractor` y de
   `service-requirement-extractor` a ACR.
2. Crear el ACA Job nuevo.
3. `update` de la fila de `service_prompts` (8.1). A partir de acá, la imagen
   vieja del extractor combinado ya no puede cargar su prompt de admisibilidad;
   por eso este paso va pegado al deploy.
4. Deploy de la API (config nueva + corte por cero requisitos).
5. Deploy de la UI.

---

## 14. Verificación

Correr un análisis real completo y comprobar:

1. **Orden del pipeline**: la secuencia de eventos y de steps es
   `documents_grouper` → pausa → `admissibility_extraction` → pausa →
   `build_proposal_index` → `admissibility_matcher` → `admissibility_gate` →
   pausa → `tender_classifier` → `requirement_extraction` → pausa →
   `compliance_matcher` → `compliance_summarizer` + `economic_offer_extractor`.
2. **Pausa nueva**: al terminar la extracción de admisibilidad el análisis queda
   en `awaiting_approval` con `paused_at_service = "service-admissibility-extractor"`,
   y la tarjeta "Requisitos de Admisibilidad" muestra el punto rojo.
3. **Datos**: `admissibility_requirements` se llena con códigos `ADM-nnn` y
   citations con `filename` y `page_number`; `analysis_requirements` se llena
   después, con `REQ-nnn`, en el paso posterior.
4. **Fases**: la UI muestra las 9 fases en orden, y las de aprobación se activan
   cuando corresponde.
5. **Costos**: en `ai_usage` aparecen filas con
   `service_name = "service-admissibility-extractor"`, y el rollup del panel de
   admin las suma.
6. **Prompts**: `/admin/config/prompts` muestra la tarjeta del extractor de
   admisibilidad bajo el servicio nuevo, y editarla y guardarla funciona.
7. **Corte por cero requisitos**: con un pliego sin requisitos de admisibilidad
   (o vaciando el prompt en un entorno de prueba), el análisis termina en
   `ready` / `is_success=true`, con el evento correspondiente y sin correr los
   jobs siguientes.
8. **Corte por ninguna admitida**: si el gate no admite ninguna propuesta, no se
   corren `tender_classifier`, `requirement_extraction` ni compliance.
9. **Fallo**: si la extracción de admisibilidad falla (>10% de batches), el
   análisis queda `ready` / `is_success=false` y el pipeline se detiene.
10. **`hitl=false`**: un análisis con HITL desactivado corre las 4 etapas de
    corrido sin pausas.

---

## 15. Fuera de alcance

- Cómo se muestra en la interfaz el análisis cortado por cero requisitos de
  admisibilidad → `features/backlog/analisis-sin-requisitos-admisibilidad.md`.
- Modelo LLM por servicio (hoy es global por análisis).
- Cambios en `service-admissibility-matcher`, `service-admissibility-gate` o en
  el esquema de 7 ejes de la extracción general.
- Renombrar `service-requirement-extractor`.
- Cambios en la tabla `admissibility_requirements`.
