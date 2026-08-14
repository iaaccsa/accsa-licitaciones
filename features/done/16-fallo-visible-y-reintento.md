# Feature 16 — Ola 2: mostrar por que fallo un analisis y permitir reintentarlo

Cubre **CP-63 y 124** ("una vez fallido el analisis no permite reintentar") y
**CP-032** ("al cargar documentos indica error y no permite tomar accion"). Son
la misma superficie: un analisis fallido hoy es un badge rojo y nada mas.

Complejidad: **media**. API + UI. Sin cambio de esquema.

---

## Estado actual, verificado en produccion el 2026-08-13

Hay **26 analisis fallidos** (`status=ready`, `is_success=false`) contra los
cuales validar. No hace falta ninguna evidencia adicional.

Lo que ya existe y no hay que construir:

- **El reintento en el backend ya esta hecho**: `POST /api/v1/analyses/{id}/retry-step`
  con body `{"service_name": "..."}` (`app/api/v1/endpoints/analyses.py:68-80`,
  implementado en `job_orchestrator_service.retry_job:499-522`). Resetea el step
  a pending, pone el analisis en processing y relanza el job. **No hay nada en
  la UI**: no existe el proxy y `grep -rn "retry-step" accsa-licitaciones-ui` no
  devuelve nada.
- **El paso que fallo es identificable en los 26**: hay una fila en
  `analysis_workflow_steps` con `status = 'failed'`.
- **El motivo siempre existe**: los 26 tienen al menos un evento de nivel
  `error`.
- **La columna `analysis_workflow_steps.error_log` existe y esta vacia en los 27
  pasos fallidos.** Nadie la escribe nunca. Es el lugar donde debe ir el motivo.

Lo que falta: escribir el motivo, exponerlo y darle al usuario un boton.

### Los mensajes de hoy NO se pueden mostrar crudos

Esto es lo mas importante del diseño. Ejemplos reales de produccion:

```
name 'mark_failed' is not defined
Failed during compliance summarization: 422 Client Error: Unprocessable Entity for url: https://accsa-licitaciones-api.vercel.app/api/v1/proposals/2cd...
HTTP Error during processing: 500 Server Error ... /api/v1/tender-classifications
Failed during processing: '"category"'
Análisis cancelado por timeout. Steps timed-out: ['converter']
```

No le dicen nada a un comprador y filtran URLs internas. Hace falta **un mensaje
para el usuario** mas **el detalle tecnico separado y colapsado**.

### Formas de fallo a cubrir

1. `Job {service} failed with error: {detalle}` — el job corrio y fallo.
2. `Failed to start job {service}` — no se pudo ni lanzar.
3. `Análisis cancelado por timeout. Steps timed-out: [...]` — lo mata el monitor.

Perfil julio-agosto (10 analisis): compliance_summarizer 3,
requirement_extraction 2, admissibility_extraction 2, y uno cada uno de
compliance_matcher, tender_classifier, build_proposal_index y converter.

---

## Diseño

### B1. Guardar el motivo en el paso que falla

`workflow_step_service.fail_step_by_service` (`:117-133`) recibe hoy solo
`analysis_id` y `service_name`. Agregarle un parametro opcional `error_message`
y persistirlo en la columna `error_log` del upsert.

Actualizar los **7 call sites** (`grep -rn fail_step_by_service app/`) para que
pasen el detalle cuando lo tienen. El unico que ya tiene el texto completo del
error del job es `on_job_completed` (`job_orchestrator_service.py:168`, la
variable `error_message` del callback); los de arranque y lanzamiento
(`:72`, `:108`, `:270`, `:523`, `:605`) tienen la excepcion a mano. Donde no
haya nada util, dejarlo en None; no inventar texto.

`fail_timed_out_analysis` (`:640-673`) marca los pasos por codigo, no por
service: que tambien escriba el `error_log` con el motivo del timeout.

### B2. Endpoint que resume el fallo

Nuevo `GET /api/v1/analyses/{analysis_id}/failure`, que devuelve `null` si el
analisis no esta fallido, y si lo esta:

```json
{
  "step_code": "compliance_summarizer",
  "display_name": "Resumen de Cumplimiento",
  "service_name": "service-compliance-summarizer",
  "error_log": "Failed during compliance summarization: 422 ...",
  "can_retry": true
}
```

- El paso es el que tenga `status = 'failed'` en `analysis_workflow_steps`. Si
  hay mas de uno (hay un caso con dos), tomar el de menor `order` o, si no hay
  orden, el primero: es el que corto la cadena.
- `service_name` sale de mapear el `code` al service. Hoy solo existe la
  direccion service -> code (`get_step_code_for_service` en
  `app/config/jobs_config.py`). **Agregar la inversa** ahi, leyendo el mismo
  `pipeline_config.json`. No hardcodear el mapeo en otro lado.
- `error_log` puede venir null en los analisis viejos: es esperado, la columna
  se empieza a escribir ahora. El endpoint no debe romper por eso.
- `can_retry` es false si no se pudo resolver el service.

### B3. Traducir el motivo para el usuario

En la UI, un diccionario que mapee el `step_code` a una frase en español que
explique **que estaba haciendo el sistema cuando fallo**, no el stack trace. Por
ejemplo, para `converter`: "El sistema no pudo convertir los documentos a texto.
Puede que alguno este dañado o protegido." Cubrir al menos los codigos del
perfil de arriba mas `extractor` y `documents_classifier`, con un texto generico
para el resto.

El `error_log` va **debajo, colapsado**, detras de un "Ver detalle tecnico", en
`font-mono` y con `break-all`. Nunca visible de entrada.

### UI

En `src/app/analyses/[id]/page.tsx`, cuando el analisis este fallido
(`status === "ready" && is_success === false`), mostrar un bloque rojo, en el
mismo lugar donde hoy va el cartel ambar de `CutShortNotice`, con:

- el titulo "El análisis no pudo completarse",
- la frase segun el paso, mas el nombre del paso donde ocurrio,
- el detalle tecnico colapsado,
- un boton **"Reintentar desde este paso"** cuando `can_retry`.

El boton hace POST al proxy nuevo
`src/app/api/analyses/[id]/retry-step/route.ts`, que reenvia a la API con
`X-API-Key` y los headers de auditoria, igual que el proxy de `resume`
(`src/app/api/analyses/[id]/resume/route.ts`, copiarlo como referencia, incluido
el `requireAnalysisAccess`). Mientras corre, deshabilitar el boton; al terminar,
`mutate` para que la vista pase a "Procesando".

### UI, el agravante de las fases

`WorkflowPhases.normalizeStatus` (`src/components/WorkflowPhases.tsx:32-37`) no
maneja `"failed"` y cae al `return "pending"`, asi que la fase que revento se
pinta **gris como "Pendiente"**. Agregar un estado `failed` con color rojo y
etiqueta "Falló", en la misma linea que el `warning` que ya existe. Tocar
`UiStatus`, `normalizeStatus`, `statusLabel`, `ringStroke` y `nodeStyle`.

---

## Fuera de alcance

- Cancelar un analisis: tiene tarjeta propia y esta bloqueada por decision.
- Reintentar desde un paso distinto del que fallo.
- Una vista de eventos para el usuario final.
- Reprocesar o volver a subir archivos.
- Arreglar las causas de fondo de cada fallo. Esto expone el fallo y permite
  reintentar; no arregla el clasificador ni el summarizer.

## Verificación

- `pnpm build` y `pnpm lint` limpios; la API importa.
- Contra un analisis fallido real de produccion: se ve el bloque rojo, con la
  frase del paso correcto y el detalle tecnico colapsado.
- El detalle tecnico **no** se ve hasta desplegarlo.
- En los analisis viejos, sin `error_log`, el bloque se muestra igual con la
  frase del paso y sin detalle tecnico. No debe romperse.
- La fase que fallo se ve roja en el diagrama, no gris como pendiente.
- Un analisis exitoso o en curso no muestra nada de esto.
- **No disparar el reintento contra produccion**: verificar el boton
  interceptando la llamada, o comprobando que el proxy existe y arma bien el
  POST. Un reintento real relanza un job y gasta computo.

## Notas

- Al terminar, borrar CP-63/124 y CP-032 de `WIP.md` y mover este archivo a
  `features/done/`.
- Ids de Planner: CP-63/124 `ky4hFXQvZkeL16Ocb6OYkWQAKeFU`, CP-032
  `MRI5IsXuPEOds6CbMdtu5mQAJs46`.
