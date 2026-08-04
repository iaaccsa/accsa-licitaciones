# Pending

## Diferido de feature-config-promps

Fuera de alcance del MVP de edicion de prompts (ver `feature-config-promps.md`).
Implementar a futuro si hace falta.

### 1. Versionado de prompts (historial + rollback)

Hoy: solo se guarda el ultimo valor de `body` + entrada en audit-logs.
No se puede ver versiones previas ni restaurar.

A futuro:
- Tabla `service_prompt_versions` (`id`, `prompt_key` FK a `service_prompts.key`,
  `body`, `created_at`, `created_by`).
- En cada `PUT /prompts/{key}`: insertar el `body` anterior en versions antes de
  sobrescribir.
- API: `GET /prompts/{key}/versions` (lista) y `POST /prompts/{key}/restore/{version_id}`
  (restaura un body previo; revalida placeholders).
- UI: en el editor, panel/tab "Historial" con lista de versiones y boton Restaurar.

### 2. Diff al guardar

Hoy: el editor guarda directo (con validacion de placeholders).

A futuro:
- Antes de confirmar Guardar, mostrar comparacion lado a lado (actual en DB vs
  editado) resaltando cambios.
- Componente diff (ej. `react-diff-viewer` o similar). Confirmar -> `PUT`.
- Util tambien combinado con (1): diff contra una version previa antes de restaurar.

### Riesgo conocido (no diferido, anotar)

En los 4 prompts que usan `.format()` (`document_category_classifier`,
`file_metadata_extractor`, `proposal_grouping`, `tender_naming`), las llaves
literales deben ir escapadas `{{ }}`. La validacion del MVP solo exige presencia
de los placeholders requeridos; NO detecta una llave suelta que rompa `.format()`
en runtime. Si esto causa problemas, agregar a futuro una validacion de
`.format()` (intentar formatear con valores dummy y capturar `KeyError`/`ValueError`).

## Prompt de admisibilidad: key renombrada en prod (2026-08-03)

`service_prompts` tenia la fila bajo la key vieja
`service-requirement-extractor/admissibility_extractor`, que ya no lee ningun
service del repo, y no existia la key que pide `service-admissibility-extractor`
(`load_prompt` no tiene fallback: sin fila el job falla al arrancar). Se hizo el
UPDATE sobre la misma fila `0702d457-b445-45bd-b05d-4c5303c93a14`: key y
`service` al nombre nuevo, y el body pasado al ganador del lab
`v1.0.0 (variante 1 3.8)` (8128 chars, sha 11ec3fc93a).

Consecuencia mientras no se despliegue: si en prod todavia corre la imagen vieja
de `service-requirement-extractor` haciendo admisibilidad, esa imagen lee la key
vieja y ahora falla. El body anterior (el ganador del 13/07, identico al lab
`8.7.26 (variante 13.7) (variante2)`) sigue estando en el lab si hay que volver.

## Restos del esquema viejo de seleccion de modelo

`model_tiers` ya paso a 2 filas por rol (2026-08-03), pero quedaron piezas del
esquema anterior que no se tocaron todavia:

- `analyses.primary_model` e `intelligence_level` se siguen escribiendo al crear
  un analisis y ya no eligen nada. `/admin/analyses/[id]` los muestra, asi que
  esa vista informa un "nivel de inteligencia" que no tiene efecto. Decidir si
  se reemplaza por el razonamiento congelado (`openai_reasoning_effort`,
  `gemini_thinking_level`) y si las columnas viejas se dejan como historico.
- `AnalysisModelConfig` devuelve `provider`, `model_id` y `fallback_model_id`
  duplicados solo por compatibilidad con las imagenes de services desplegadas.
  Sacarlos cuando las 16 imagenes lean `primary` y `secondary`.
- `model_tiers` tiene `input_price_per_1m` / `output_price_per_1m` /
  `cached_input_price_per_1m` en null y nadie los lee: el costo sale de
  `ai_pricing`. Decidir si se completan o se eliminan las columnas.

## (Resuelto 2026-08-03) Ajustar `model_tiers` al nuevo esquema de modelos

Contexto (2026-08-03): la vista `/admin/config/llm-config` dejo de elegir
proveedor + nivel de inteligencia. Ahora muestra dos modelos fijos, cada uno con
su propio razonamiento: principal `gpt-5.6-terra` (OpenAI, `reasoning_effort`
none|low|medium|high|xhigh) y secundario `gemini-3.6-flash` (Google,
`thinking_level` minimal|low|medium|high). Se guardan en `app_settings.llm_config`
como `openai_reasoning_effort` y `gemini_thinking_level`.

`model_tiers` quedo desalineada. Hoy esta indexada por `(provider, level)` y
tiene 6 filas con modelos viejos, cada una con su fallback cruzado:

```
gemini low    -> gemini-3.1-flash-lite  (fallback gpt-5.4-nano)
gemini medium -> gemini-3.5-flash       (fallback gpt-5.4-mini)
gemini high   -> gemini-3.1-pro         (fallback gpt-5.5)
openai low    -> gpt-5.4-nano           (fallback gemini-3.1-flash-lite)
openai medium -> gpt-5.4-mini           (fallback gemini-3.5-flash)
openai high   -> gpt-5.5                (fallback gemini-3.1-pro)
```

Problemas a resolver:
- El par `(provider, level)` ya no es la clave de seleccion: el modelo es fijo y
  lo que varia es el razonamiento, con dominios distintos por proveedor
  (5 valores en OpenAI, 4 en Gemini, y no coinciden: OpenAI no acepta `minimal`,
  Gemini no acepta `none` ni `xhigh`).
- El fallback cruzado deja de ser por fila: el secundario es siempre
  `gemini-3.6-flash`.
- Faltan los precios de `gpt-5.6-terra` y `gemini-3.6-flash` en
  `input_price_per_1m` / `output_price_per_1m` (los usa el rollup de costos).

Arrastres a decidir junto con la tabla (siguen vivos y hoy no se tocan):
- `app_settings.llm_config` conserva `primary_model` + `intelligence_level`
  porque `analysis_service.create_analysis_from_storage` los copia a
  `analyses.primary_model` / `analyses.intelligence_level`.
- `GET /api/v1/analyses/{id}/model-config` resuelve el tier con esos dos campos
  (`model_tier_service.get_tier`) y es lo que consumen los services para saber
  con que modelo correr.
- Enums `PrimaryModel` / `IntelligenceLevel` en `app/schemas/analysis.py` y
  `ModelTier` en `app/schemas/model_tier.py`.

## Revision: campo `roles` de admisibilidad (obligatoria vs subsanable)

Contexto (2026-07-13): se elimino de la UI el filtro por rol de la matriz de
admisibilidad por propuesta (`AdmissibilityMatrix.tsx`) porque con los ultimos
cambios la distincion `admisibilidad_obligatoria` / `admisibilidad_subsanable`
ya no aplica. Falta decidir si el campo `roles` se conserva como metadato o se
elimina de punta a punta.

Primero verificar: si el prompt dedicado de admisibilidad (iterado en
admissibility-lab) ya no emite la distincion, el campo queda con valor constante
(el extractor hace fallback a `admisibilidad_obligatoria`) y toda la logica que
depende de el pierde sentido.

Usos actuales (si se elimina, decidir que pasa con cada uno):
- `service-requirement-extractor/main.py`: emite y normaliza roles del output
  LLM (mapa de sinonimos, `AdmissibilityRole` Literal, fallback a obligatoria).
- `service-admissibility-gate/main.py`: nucleo de la decision. Solo requisitos
  con rol obligatoria bloquean la admision; los subsanables generan evento
  aparte (`auto_admisibilidad_subsanable_*`). Si roles desaparece, todos los
  `no_cumple` pasarian a bloquear, o hay que definir otro criterio de exclusion.
- `service-compliance-summarizer/main.py`: clasifica fallos criticos segun rol
  obligatoria.
- API `app/schemas/admissibility_requirement.py`: enum de roles permitidos +
  filtro `role` en los endpoints (la UI ya no lo envia).
- UI: `src/lib/admissibility-types.ts` (`EXCLUSIONARY_ROLE`, `isExclusionary`
  -> badge "Excluyente"), badges de rol en `AdmissibilityMatrix.tsx` y en
  `/analyses/[id]/admissibility-requirements`.
- DB: columna `roles` en `admissibility_requirements` + datos historicos ya
  extraidos con roles.
- Ojo: los mismos valores de rol existen tambien en los requisitos generales
  (`ComplianceMatrix.tsx`, `/analyses/[id]/requirements`,
  `/admin/analyses/[id]/evaluation_system`, API `schemas/requirement.py`,
  `service-tender-classifier`). Eso es la matriz de cumplimiento general:
  decidir por separado, no arrastrarlo en esta limpieza.

Opciones: (a) conservar `roles` como metadato informativo sin filtro; (b)
eliminarlo de punta a punta y redefinir el criterio de exclusion del gate;
(c) quitarlo solo del flujo dedicado de admisibilidad y dejar el de la matriz
general como esta.
