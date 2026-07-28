# services-enhancements.md

Revisión técnica de `accsa-licitaciones-services` (15 microservicios ACA Jobs +
código compartido en `global/`). Análisis de estructura, bugs, seguridad,
rendimiento y mantenibilidad.

Fecha: 2026-06-25. Alcance revisado: `main.py` de los 15 services (~8.500 LOC),
`global/supabase_logger.py`, `global/ai_usage_logger.py`, `global/prompt_loader.py`,
Dockerfiles, `requirements.txt`, `build-and-push.sh`, `.gitignore`.

---

## Resumen priorizado

| # | Severidad | Tipo | Hallazgo |
|---|-----------|------|----------|
| B1 | Alta | Bug | `mark_failed` usado sin importar en `service-compliance-matcher` |
| B2 | Media | Bug | requirement-extractor cuenta "batch sin requisitos" como "batch fallido" |
| B3 | Media | Bug | `resolve_model_config` arma URL con doble slash; config de modelo se ignora en silencio |
| B4 | Media | Bug/Robustez | módulos `global/` leen env vars en tiempo de import; faltante mata el job sin `notify_failure` |
| S1 | Media | Seguridad | secretos en texto plano en el working tree (`credentials`, `backend-credentials`, `az-token`) |
| S2 | Media | Seguridad | falta `.dockerignore`; el build context es la raíz del repo (envía secretos al daemon) |
| S3 | Media | Seguridad | todos los contenedores corren como root |
| O1 | Media | Mantenibilidad | duplicación masiva de código (matchers casi idénticos; boilerplate x15) |
| O2 | Media | Rendimiento | patrones N+1 de requests (inserts/PATCH uno por uno) |
| O3 | Media | Rendimiento | embeddings no batcheados (tender-classifier: 10 llamadas en vez de 1) |
| B5 | Baja | Bug | `classify_file` hace `result["category"]` (KeyError si falta la clave) |
| B6 | Baja | Bug | `raise last_error` con `last_error=None` -> TypeError (edge case) |
| B7 | Baja | Bug | descarga del ZIP usa `requests.get` directo (sin la sesión con reintentos) |
| B8 | Baja | Bug | `make_batches` entra en loop infinito si `overlap >= size` (latente) |
| S4 | Baja | Seguridad | imagen base sin fijar por digest |
| S5 | Baja | Privacidad | PII de oferentes enviada a OpenAI/Gemini |
| S6 | Baja | Seguridad | file-extractor sin límite de descompresión (zip bomb) y carga el ZIP entero en memoria |
| S7 | Baja | Seguridad | reintentos automáticos sobre POST no idempotentes (callbacks, creación) |
| O4-O9 | Baja | Mejoras | concurrencia OCR, dep `unzip` inútil, pinning de deps, etc. |

---

## Bugs

### B1 (Alta) - `mark_failed` usado sin importar
**Archivo:** `service-compliance-matcher/main.py:673` (import en `:45`)

```python
# :45
from supabase_logger import setup_logger, log_event, make_session   # falta mark_failed
...
# :670-674  (cuando no hay requisitos verificados)
if not requirements:
    msg = "No se encontraron requisitos verificados ..."
    log_event(ANALYSIS_ID, "warning", msg, EVENT_SOURCE)
    mark_failed(ANALYSIS_ID, msg, EVENT_SOURCE)   # NameError
    raise RuntimeError(msg)
```

`mark_failed` existe en `supabase_logger.py` pero no se importa aquí. Cuando una
propuesta llega sin requisitos verificados, esta rama lanza
`NameError: name 'mark_failed' is not defined` en lugar del mensaje claro. El
`raise RuntimeError(msg)` nunca se ejecuta y el error que ve el usuario queda
enmascarado ("Failed during compliance matching: name 'mark_failed' is not
defined").

**Fix:** `from supabase_logger import setup_logger, log_event, make_session, mark_failed`

---

### B2 (Media) - Batch sin requisitos se cuenta como batch fallido
**Archivo:** `service-requirement-extractor/main.py:1536`

```python
outcome = future.result()
outcomes[batch_id] = outcome
if not outcome.requirements:        # <-- empty list == "fallido"
    failed_batches += 1
else:
    raw_results.extend(outcome.requirements)
```

`extract_batch` distingue éxito-con-cero-requisitos (asigna `outcome.requirements
= []` y deja `general_failure_reason = None`) de fallo real (deja
`general_failure_reason`). El conteo usa la lista vacía, así que un batch que el
LLM procesó bien pero que legítimamente no contiene requisitos (texto de relleno,
índices, anexos no normativos) se contabiliza como fallido. Con muchos batches de
ese tipo se puede superar el umbral `MAX_FAILED_BATCH_RATIO` (10%) y abortar toda
la extracción por error, o al revés enmascarar fallos reales en la estadística.

**Fix:** contar fallos por la causa explícita:
```python
if outcome.general_failure_reason is not None:
    failed_batches += 1
if outcome.requirements:
    raw_results.extend(outcome.requirements)
```

---

### B3 (Media) - `resolve_model_config` arma la URL con doble slash
**Archivos:** los 9 services LLM. Ej. `service-compliance-matcher/main.py:169`,
`service-requirement-extractor/main.py:552`, `service-documents-classifier/main.py:100`,
`service-tender-classifier/main.py:420`, etc.

```python
cfg = api_request("GET", f"{API_ANALYSES_PATH}/{ANALYSIS_ID}/model-config")
```

El resto del archivo usa `f"{API_ANALYSES_PATH}{ANALYSIS_ID}"` (sin slash), lo que
implica que `API_ANALYSES_PATH` ya termina en `/` (ej. `/api/v1/analyses/`).
Aquí el slash extra produce `/api/v1/analyses//<id>/model-config`. Si el router
del backend es estricto con el doble slash, el GET devuelve 404, cae en el
`except` y **siempre se usan los modelos por defecto**, ignorando en silencio la
selección de modelo del usuario (provider/model_id/fallback). El fallo es mudo
porque está diseñado para degradar a defaults.

**Fix:** `f"{API_ANALYSES_PATH}{ANALYSIS_ID}/model-config"` (consistente con el resto).

---

### B4 (Media) - Env vars requeridas se leen en tiempo de import; faltante mata el job sin reportar
**Archivos:** `global/supabase_logger.py:20-22`, `global/ai_usage_logger.py:24-27`,
`global/prompt_loader.py:5-7`

```python
# supabase_logger.py
API_BASE_URL = os.environ["API_BASE_URL"]
API_KEY = os.environ["API_KEY"]
API_EVENTS_PATH = os.environ["API_EVENTS_PATH"]
# ai_usage_logger.py
API_PRICING_PATH = os.environ["API_PRICING_PATH"]
API_USAGE_PATH = os.environ["API_USAGE_PATH"]
# prompt_loader.py
API_PROMPTS_PATH = os.environ["API_PROMPTS_PATH"]
```

Se leen con `os.environ[...]` a nivel de módulo, es decir en el `import`, que ocurre
ANTES de `validate_env()` y FUERA del `try/except` de `main()`. Si falta cualquiera
de estas variables, el job revienta con `KeyError` durante el import: no se ejecuta
`validate_env()` (mensaje claro), no se llama `notify_failure()` ni el job callback.
Desde el orquestador el paso "desaparece" (se cuelga hasta el timeout) sin evento
de error.

Agravante: ningún `validate_env()` de los services valida `API_PRICING_PATH`,
`API_USAGE_PATH` ni `API_PROMPTS_PATH`, pese a ser obligatorias.

**Fix:** leer con `os.environ.get(...)` en los módulos globales y validar temprano,
o agregar esas tres variables a cada `validate_env()` (que corre primero en `main`).

---

### B5 (Baja) - `classify_file` puede lanzar KeyError
**Archivo:** `service-documents-classifier/main.py:204`

```python
result = call_llm_json(gemini_client, openai_client, prompt)
return result["category"]
```

Si el JSON del LLM es válido pero no incluye `category`, `KeyError` propaga y hace
fallar todo el análisis por un único archivo. El `call_llm_json` solo cubre fallos
de proveedor, no JSON bien formado pero incompleto.

**Fix:** `return result.get("category", "unclassified")`.

---

### B6 (Baja) - `raise last_error` con `last_error=None`
**Archivos:** `service-documents-classifier/main.py:187`, `service-documents-grouper/main.py:195`

```python
for provider, model in [(PRIMARY_PROVIDER, PRIMARY_MODEL), (FALLBACK_PROVIDER, FALLBACK_MODEL)]:
    if not model:
        continue
    ...
raise last_error   # si ambos model son vacíos, last_error sigue None
```

Si `model-config` devuelve `model_id`/`fallback_model_id` vacíos para ambos,
ningún proveedor se intenta y `raise None` lanza
`TypeError: exceptions must derive from BaseException`, ocultando la causa real.

**Fix:** `raise last_error or RuntimeError("no LLM provider/model available")`.

---

### B7 (Baja) - Descarga del ZIP sin la sesión con reintentos
**Archivo:** `service-file-extractor/main.py:262`

```python
response = requests.get(download_url, timeout=300)
```

Usa `requests.get` directo en vez de `SESSION` (que tiene reintentos con backoff).
Una caída transitoria de Supabase Storage falla el job sin reintentar.
Inconsistente con el resto de llamadas del archivo.

---

### B8 (Baja, latente) - `make_batches` loop infinito si `overlap >= size`
**Archivo:** `service-requirement-extractor/main.py:733`

```python
step = size - overlap
...
start += step   # si step <= 0, nunca avanza
```

Con las constantes actuales (`size=15`, `overlap=2`, `step=13`) está bien, pero es
una bomba de tiempo si alguien ajusta la config. Agregar `assert size > overlap` o
`step = max(size - overlap, 1)`.

---

## Seguridad

### S1 (Media) - Secretos en texto plano en el working tree
**Archivos (raíz del repo):** `credentials`, `backend-credentials`, `az-token`

- `credentials` / `backend-credentials`: service principals de Azure con
  `appId` + `password` (client secret) + `tenant` en claro.
- `az-token`: JWT de acceso a `management.azure.com`.

Verificado: están en `.gitignore` y **nunca se commitearon** (revisado
`git log --all` para los tres). Riesgo residual: están en disco sin cifrar en el
repo, expuestos a copias de seguridad, sincronización o compartir accidental.

**Recomendación:** mover a un gestor de secretos (Key Vault / variables de CI),
rotar los `password` de ambos service principals (son de larga vida; un token JWT
expira solo, los client secrets no) y eliminar los archivos del working tree.

### S2 (Media) - Falta `.dockerignore`; build context = raíz del repo
**Archivos:** todos los `build-and-push.sh` hacen `docker build ... -f Dockerfile ..`
(contexto = raíz). No existe ningún `.dockerignore`.

Cada build envía TODO el árbol al Docker daemon, incluidos `credentials`,
`backend-credentials`, `az-token`, `.env.local`, `.venv/`, `.git/`, `_archived/`.
No llegan a la imagen final (los Dockerfile solo `COPY` archivos puntuales), pero:
1. los secretos quedan expuestos al daemon y a la caché de build;
2. cualquier futuro `COPY . .` los hornearía en la imagen;
3. el contexto es enorme -> builds lentos.

**Recomendación:** agregar `.dockerignore` en la raíz (al menos:
`credentials`, `backend-credentials`, `az-token`, `.env*`, `.venv/`, `.git/`,
`_archived/`, `_review/`, `**/__pycache__/`, `*.md`).

### S3 (Media) - Contenedores corren como root
**Archivos:** los 15 Dockerfiles (ninguno tiene `USER`).

Best practice de hardening: crear y usar un usuario no privilegiado.
```dockerfile
RUN useradd -m -u 10001 appuser
USER appuser
```
Riesgo acotado por ser ACA Jobs efímeros, pero recomendable.

### S4 (Baja) - Imagen base sin fijar por digest
Los 15 usan `FROM python:3.12-slim` (tag móvil). Builds no reproducibles y
superficie de cambio incontrolada. Fijar por digest (`python:3.12-slim@sha256:...`)
y escanear (Trivy/Grype).

### S5 (Baja) - PII de oferentes enviada a terceros (OpenAI/Gemini)
**Archivos:** `service-documents-grouper/main.py:215-225,341-351` y los matchers.

Se envían `signer_name`, `organization`, `tax_id` (cédula/RUT) en los prompts de
agrupamiento y naming, y los certificados con PII se almacenan en DB
(`service-digital-sig-extractor`). No es un bug de código, pero para datos de
licitaciones públicas conviene confirmar base legal/DPA, minimización de datos y
políticas de retención de los proveedores LLM.

### S6 (Baja) - Manejo de ZIP en file-extractor
**Archivo:** `service-file-extractor/main.py:262-278`

- Sin límite de descompresión: `zf.extractall()` puede inflar un ZIP pequeño a GB
  y llenar el disco efímero del job (DoS). Validar tamaño total descomprimido y
  número de entradas antes de extraer.
- `file_bytes = response.content` carga el ZIP completo en memoria, y luego se
  extrae a disco; sin cap de tamaño en la descarga. Picos de memoria.
- Path traversal ("zip slip"): mitigado por el saneamiento de `zipfile` en
  Python 3.6+, pero conviene validar rutas de miembros explícitamente por defensa
  en profundidad.

### S7 (Baja) - Reintentos automáticos sobre POST no idempotentes
**Archivo:** `global/supabase_logger.py:44-61` (`allowed_methods` incluye `POST`)

`make_session()` reintenta POST en 429/5xx. Para `API_JOBS_CALLBACK` y los POST de
creación (`proposals`, `tenders`) un reintento tras un éxito real con respuesta
perdida puede duplicar (doble avance del pipeline, propuestas duplicadas). Depende
de la idempotencia del backend. Considerar excluir POST del retry para endpoints
no idempotentes, o exigir idempotencia/clave de deduplicación en el backend.

---

## Rendimiento y optimización

### O1 (Media) - Duplicación de código
- `service-compliance-matcher` y `service-admissibility-matcher` son ~95% idénticos
  (modelos pydantic, `rag_search_proposal_chunks`, `build_user_prompt`,
  `_call_*_sync`, `post_process_single`, `evaluate_and_persist`, `run_matching_pass`:
  ~600 líneas duplicadas). La única diferencia real es la tabla destino y el colapso
  binario del verdict en admissibility.
- El bloque `api_request` + `resolve_model_config` + `validate_env` + `notify_failure`
  se repite casi textual en los 15 services.

Impacto: un fix hay que replicarlo N veces (ver B1 y B3, que son exactamente esto).
**Recomendación:** extraer la maquinaria común a `global/` (ya hay precedente con
`supabase_logger`): p.ej. `global/api_client.py`, `global/llm.py`,
`global/model_config.py`.

### O2 (Media) - Patrones N+1 de requests
- `service-file-extractor/main.py:141-142`: inserta file records uno por uno en loop.
- `service-documents-grouper/main.py:287-298, 400-410`: PATCH por archivo + propaga a
  `original_files` uno por uno.
- `service-digital-sig-extractor/main.py:272-277`: PATCH por cada `processed_file`.

**Recomendación:** usar endpoints bulk donde exista (requirement-extractor ya usa
`/bulk`). Nota: los matchers hacen 1 POST batch por requisito a propósito (escritura
incremental para refrescar la UI); ese trade-off es aceptable.

### O3 (Media) - Embeddings no batcheados
- `service-tender-classifier/main.py:621-622`: embebe las 10 `CLASSIFICATION_QUERIES`
  en 10 llamadas separadas a `embeddings.create`. Se pueden mandar en una sola
  (`input=[...10...]`).
- compliance/admissibility/economic: 1 embedding por requisito de forma secuencial
  antes de la fase LLM; se podrían batchear o paralelizar.
- `service-qdrant-by-file` ya batchea de a 100 (bien, dejarlo como referencia).

### O4 (Baja) - OCR secuencial en files-converter-mistral
`process_conversion` procesa los archivos en serie (descarga -> Mistral upload ->
poll signed URL -> OCR -> delete). Con muchos archivos el job es largo. Posible
paralelismo controlado con `ThreadPoolExecutor` respetando los rate limits de Mistral.

### O5 (Baja) - Dependencia de sistema `unzip` inútil
`service-file-extractor/Dockerfile` instala `unzip` vía apt, pero el código usa el
módulo `zipfile` de Python. Eliminar el `apt-get install unzip` (reduce imagen y
superficie).

### O6 (Baja) - Pinning de dependencias
Todas las `requirements.txt` usan `>=` sin cota superior; `service-file-extractor`
tiene `requests` sin versión. Builds no reproducibles y riesgo de breaking changes
(p.ej. `openai`, `google-genai`, `qdrant-client`, `pydantic`). **Recomendación:**
fijar con `==`/`~=` + lockfile, e integrar `pip-audit` en CI.

### O7 (Baja) - `try/except ImportError` inconsistente
`service-compliance-summarizer/main.py:14-45` es el único con stubs no-op para
`log_event`, `record_usage`, etc. En producción podría enmascarar un módulo faltante
(sin logging ni cost accounting, en silencio). Unificar con el resto (import directo).

### O8 (Baja) - Montos como `float` en economic-offer-extractor
`total_amount`, `subtotal`, `unit_price` son `float`. La comparación de tolerancia
del 1% (`main.py:553`) puede arrastrar error de redondeo. Para dinero, `Decimal`
es más seguro. Menor, dado que es extracción aproximada con revisión manual.

### O9 (Baja) - Imports sin uso / limpieza
Ej.: `from datetime import datetime, timezone` en
`service-files-converter-mistral/main.py:27` no se usa. Conviene una pasada de
linter (ruff/flake8) en CI; hay varios imports muertos y `Path` importado en
services que no lo usan.

---

## Notas de comportamiento (verificar si es intencional)

- `notify_failure` marca el análisis como `{"status": "ready", "is_success": False}`
  en lugar de un estado "failed". Parece intencional (UI: completado-pero-fallido),
  pero conviene dejarlo documentado.
- `service-compliance-summarizer/main.py:372-378`: el denominador de
  `compliance_rate` es `sum(counts) - no_aplica`, es decir incluye `no_evidencia` y
  `requiere_verificacion_manual`. Confirmar que esa es la métrica deseada (penaliza
  propuestas con muchos ítems de verificación manual).
- `service-documents-grouper/main.py:55`: `GEMINI_FALLBACK_MODEL =
  "gemini-3.1-pro-preview"` como default de fallback. Verificar que el id de modelo
  exista/esté disponible (es solo default, lo sobrescribe `model-config`, pero si la
  config no aplica por B3 podría usarse un id inválido).

---

## Lo que está bien (para no romperlo)

- Patrón consistente: `validate_env` con salida temprana, `notify_failure` +
  job callback, eventos vía API en vez de logs de contenedor.
- Fallback LLM (primario -> secundario) con reintentos y backoff en todos los
  services de IA; cost accounting congelado por snapshot de precios.
- Colecciones Qdrant idempotentes (drop + create) en qdrant-by-file y
  build-proposal-index.
- `service-requirement-extractor`: validación multi-eje con pydantic, normalizadores
  de alias ES->canónico, dedup por hash, asignación de códigos por posición,
  validación contra el `evaluation_profile`, umbral de batches fallidos. Muy sólido
  (salvo B2).
- compliance/admissibility matchers: concurrencia con `asyncio.Semaphore` +
  `asyncio.to_thread`, persistencia incremental, degradación a
  `requiere_verificacion_manual` y guardia de ratio de fallos.
- Las dependencias declaradas en `requirements.txt` coinciden con los imports de
  cada service (no hay dependencias faltantes).
