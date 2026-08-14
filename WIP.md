# WIP - Bugs del Planner

Relevamiento hecho el 2026-08-13 sobre 26 tarjetas asignadas. Cada tarjeta
contrastada contra el codigo actual de `accsa-licitaciones-ui`,
`accsa-licitaciones-api` y `accsa-licitaciones-services`.

**Al resolver una tarjeta se la borra de este archivo**, no se la marca. El
registro de lo hecho queda en el CHANGELOG, en `features/done/` y en el
historial de git.

Fuente: plan "MVP - Asistente de Compras Estatales" en MS Planner. Los ids de
tarjeta estan al final de cada seccion para poder cerrarlas con
`tools/planner/planner.py done <ID> --note "..."`.

---

## Panorama

| Veredicto | Cant. |
|---|---|
| Bug real, confirmado en codigo | 4 |
| Necesita mas informacion antes de tocar codigo | 4 |

De las 26 relevadas ya salieron 10 de este archivo:

- En "Pendiente Testing" a nombre de Eduardo desde el 2026-08-13: CP-13
  (resuelta), CP-11 y CP-16/17 (ya estaban resueltas de antes), CP-00 v2 (no es
  bug, es configuracion) e ID 212 (el testing ya se ejecuto y genero las
  tarjetas TC-CLI).
- Resueltas el 2026-08-13 y todavia sin pasar a testing: CP-154, CP-29, CP-113,
  CP-18, la mitad de backend de CP-42, y el grupo entero de subida
  (TC-CLI-118/127, TC-CLI-121, TC-CLI-126, CP-155, CP-51/32), que habilita
  ademas el re-test de ID 212.

---

## Decisiones pendientes (bloquean el plan)

- [ ] **Cancelar analisis.** Se removio a proposito el 2026-07-13 (commits
  `0f4932f` y `5545506`). La tarjeta no tiene descripcion. Averiguar quien la
  pidio y que espera: matar los jobs en curso u ocultar el analisis.
- [ ] **CP-103 sesion unica.** Complejidad L, no hay nada de infraestructura hoy.
  Confirmar si es requisito real o una observacion de QA.
- [ ] **CP-102 alcance.** Fijar `cookieOptions.maxAge` a sesion cierra la queja
  literal, pero mata cualquier "recordarme" futuro. Confirmar.

---

## Grupo B - Estado y ciclo de vida del analisis (3 tarjetas)

- [ ] **CP-63 y 124** una vez fallido no permite reintentar. **Alta / M.**
  El backend **ya tiene** el retry: `POST /api/v1/analyses/{id}/retry-step`
  (`accsa-licitaciones-api/app/api/v1/endpoints/analyses.py:68-80`, implementado
  en `app/services/job_orchestrator_service.py:499-522`).
  No hay nada en la UI: no existe `src/app/api/analyses/[id]/retry-step/` y
  `grep -rn "retry-step" accsa-licitaciones-ui` no devuelve nada. Solo `resume`
  esta cableado (`analyses/[id]/page.tsx:146-164`).
  El motivo del fallo tampoco se muestra: solo se escribe en un evento
  (`job_orchestrator_service.py:167-172`) y no hay vista de eventos para el
  usuario (solo `/admin/analyses/[id]/events`). El detalle solo pinta el badge
  rojo "Fallido" (`analyses/[id]/page.tsx:466-476`).
  Agravante: `WorkflowPhases.normalizeStatus` (`:32-37`) no maneja `"failed"` y
  cae a `"pending"`, asi que la fase caida se ve gris como "Pendiente" (`:51-56`).
  `id: ky4hFXQvZkeL16Ocb6OYkWQAKeFU`

- [ ] **CP-032** al cargar documentos indica error en la pantalla de analisis.
  **Alta / M.** Misma superficie que CP-63. Cualquier fallo de job justo despues
  de la subida deja el analisis en `ready` / `is_success=false`
  (`job_orchestrator_service.py:75` preflight de credenciales, `:115-116`
  excepcion de `start_pipeline`, `:171` callback de job, `:587`). El usuario ve
  solo el badge rojo (`analyses/[id]/page.tsx:471-475`,
  `AnalysisCard.tsx:100-106`): sin texto de error, sin reintentar, sin recargar.
  La vista de archivos (`analyses/[id]/files/page.tsx`) solo tiene mover,
  excluir y resume (`:219`, `:238`, `:248`).
  **Datos reales en produccion (relevado 2026-08-13), ya no hace falta la
  evidencia adjunta:** hay **26 analisis fallidos** (`status=ready`,
  `is_success=false`) para validar contra ellos.
  - Los **26 tienen al menos un evento de error**, asi que el motivo siempre
    existe: falta exponerlo, no capturarlo.
  - Los **26 tienen un paso identificable en `failed`** en
    `analysis_workflow_steps`, asi que el boton de reintentar sabe que service
    relanzar sin adivinar (`retry_job` pide `service_name`).
  - **`analysis_workflow_steps.error_log` existe y esta vacio en los 27 pasos
    fallidos.** Es el lugar natural para guardar el motivo, sin cambio de
    esquema.
  - Los mensajes de hoy son para desarrollador, no para el usuario: `name
    'mark_failed' is not defined`, `422 Client Error ... /api/v1/proposals/2cd`,
    `Failed during processing: '"category"'`. **No se pueden mostrar crudos**:
    no dicen nada al comprador y filtran URLs internas. Hace falta un mensaje
    para el usuario mas el detalle tecnico separado.
  - Tres formas de fallo a cubrir: `Job X failed with error: ...`,
    `Failed to start job X` y `Análisis cancelado por timeout. Steps
    timed-out: [...]`.
  - Perfil julio-agosto (10 analisis): compliance_summarizer 3,
    requirement_extraction 2, admissibility_extraction 2, y uno cada uno de
    compliance_matcher, tender_classifier, build_proposal_index y converter.
  `id: MRI5IsXuPEOds6CbMdtu5mQAJs46`

- [ ] **Agregar la posibilidad de cancelar un analisis.** **Media / M-L.**
  No existe: no hay endpoint en `app/api/v1/endpoints/analyses.py` (solo
  `resume`, `retry-step`, `status`, `PATCH`), y el enum `analysis_status` en DB
  no tiene `cancelled` (`supabase-backup/...20260624_112015.sql:61-66`:
  `pending | processing | ready | awaiting_approval`; `cancelled` solo existe en
  `job_status`, `:122-129`).
  La UI tiene codigo muerto que lo anticipa: `"cancelled"` en el type union
  (`analyses/[id]/page.tsx:43`), en `FINISHED_STATUSES` (`:82`) y un badge
  "Cancelado" (`:460-465`) que no puede renderizar nunca.
  Lo unico parecido es el timeout automatico
  (`job_orchestrator_service.py:640-659`, "Analisis cancelado por timeout"), que
  escribe `{"status": "ready", "is_success": False}`, o sea se ve como Fallido.
  **Ojo: se removio a proposito** el 2026-07-13 (`0f4932f` borro el endpoint, el
  `cancel_pipeline` del orquestador, `CancelPipelineResponse`,
  `job_repository.cancel_all_jobs` y `cancel_pending_by_analysis`; `5545506`
  saco el boton). Reimplementar es revertir una decision, no arreglar un bug.
  **Falta info:** la tarjeta no tiene descripcion.
  `id: r9DgdP_b7U-PmRw70jRZDmQABfXU`

---

## Grupo D - IA y prompts (2 tarjetas)

**Donde viven los prompts.** No estan en archivos: los `prompt_*.md` se borraron
despues del seed inicial. La tabla `service_prompts` en Supabase (proyecto
`yeawvnrvnnbuiejvrzbt`) es la autoridad, y se lee al arrancar cada job via
`accsa-licitaciones-services/global/prompt_loader.py:10-19` (sin fallback: si no
hay fila, el job falla al arrancar). Se editan en `/admin/prompts`; API en
`accsa-licitaciones-api/app/api/v1/endpoints/prompts.py`; lista de keys en
`accsa-licitaciones-services/scripts/seed_prompts.py:27-119`.

Keys relevantes:
- `service-compliance-matcher/compliance_evaluator` - `updated_at` 2026-06-15, 4058 chars
- `service-admissibility-matcher/compliance_evaluator` - `updated_at` 2026-07-13, 3523 chars
- `service-economic-offer-extractor/economic_offer_extractor` - `updated_at` 2026-06-26, 6548 chars

- [ ] **CP-149** la IA no interpreta el requisito de minimo. **Alta / S** (mas M
  de validacion). Cero codigo: se edita en `/admin/prompts`.
  Barrido de los 11 prompts vivos con `minim|al menos|igual o superior|>=`:
  **cero coincidencias** en los dos matchers (los 3 hits de "at least" en otros
  prompts son sobre citas). No hay ninguna instruccion de que una spec superior
  satisface un minimo.
  Peor: el prompt de `compliance-matcher` empuja en la direccion contraria.
  Define `no_cumple` como "explicit evidence of non-compliance... (e.g. offered
  value is outside the allowed range, wrong material, longer deadline)"
  (`supabase-backup/...sql:64919-64921`), y su unico ejemplo trabajado ensena que
  ofrecer **mas** es un incumplimiento (`...sql:64963-64970`): un magnetotermico
  de 20 A donde piden 16 A lo marca `cumple_parcial` con
  `missing_elements: ["el interruptor magnetotermico debe ser de 16 amperios, no
  de 20"]`. El modelo hace exactamente lo que le pedimos.
  El bloque de veredictos identico esta en
  `service-admissibility-matcher/compliance_evaluator` en el snapshot viejo
  (`...sql:64615-64617`, `64659-64661`); la version viva (reescrita 2026-07-13)
  saco el ejemplo pero no agrego regla de `>=`, solo mas rigor ("Absence of
  evidence is a strong signal of non-compliance").
  El servicio no agrega nada: `service-compliance-matcher/main.py:410-429`
  (`build_user_prompt`) pasa solo `requirement_text`, `domain`,
  `verification_method` y los chunks; todo el system prompt es el body de la DB
  (`main.py:138`, `:443`, `:468`, `:720`). Misma forma en
  `service-admissibility-matcher/main.py`.
  **Falta info:** necesito el pliego y la propuesta reales del caso para
  reproducir y validar el prompt nuevo en el lab.
  `id: A4AwdrWDNU23e6ZTgVPqXGQAC9nN`

- [ ] **CP-150** la IA no extrae datos economicos. **Alta / M.**
  Servicio: `accsa-licitaciones-services/service-economic-offer-extractor/main.py`.
  Entrada: coleccion Qdrant `PROPOSAL_{analysis_slug}_{PROPOSAL_ID}`
  (`:616-618`), construida por `service-build-proposal-index`. Recuperacion ANN
  multi-query pura, sin fallback por keyword ni regex:
  `rag_retrieve_economic_chunks` (`:357-388`) embebe 7 queries fijas en espanol
  (`:92-100`) con `text-embedding-3-small`, `limit=RAG_TOP_K_PER_QUERY` = **5**
  cada una (`:84`), dedup hasta `RAG_MAX_TOTAL_CHUNKS` = **20** (`:85`). Las
  claves de payload que lee (`text`, `Header 1`, `chunk_index`, `:377-382`)
  coinciden con lo que escribe `service-qdrant-by-file/main.py:161`, `:221-222`,
  asi que ese lado esta bien.

  Por que devuelve nada con un "USD 48.000" explicito:
  1. **El prompt es casi-refusenik a proposito.** Dice: "You must be strict:
     extract economic values ONLY when the retrieved chunks clearly correspond to
     a formal economic offer, quotation, price schedule, or commercial proposal",
     y su lista de exclusiones termina en "isolated monetary amounts not clearly
     tied to the bidder's offer", con retorno obligatorio todo-null,
     `confidence="muy_baja"`, `requires_manual_review=true`. Un precio en una
     carta de presentacion o en un anexo tecnico cae justo en la exclusion.
     Ultima edicion 2026-06-26: el endurecimiento es la causa probable.
  2. **top-5 por query sobre una propuesta multi-archivo es magro**; la linea de
     precio pierde contra prosa mas cercana. Sin reranking (a diferencia de otros
     servicios) y sin umbral de score.
  3. **Inanicion de queries:** el `break` de `:383-386` corta apenas el dedup
     llega a 20, y 7 x 5 = 35, asi que con poco solapamiento las queries 5-7
     (validez, formula de ajuste, desglose por item) **nunca se ejecutan**. La
     query 1 (precio total) si corre, asi que esto es secundario pero real.
  4. Solo corre para propuestas `admitida`
     (`app/config/pipeline_config.json:217` `require_admitida: true`, fan-out en
     `job_orchestrator_service.py:294-297`), asi que una propuesta rechazada
     antes del resume no llega a tener fila.

  No es un crash: aun con cero chunks se persiste la fila (`:634-646`) con
  `total_amount=null` y `requires_manual_review=true`; `post_process`
  (`:571-574`) fuerza `confidence="muy_baja"`.

  En la UI: `EconomicOfferCard.tsx:131-147` muestra "Sin datos economicos
  extraidos para esta propuesta" solo cuando `offer` es falsy, o sea cuando el
  fetch da 404 (`:82-88`) = no hay fila = propuesta no `admitida`. Un CP-150 real
  normalmente pinta la card con guiones y el chip ambar "Requiere revision
  manual" (`:164-168`). En el resumen, `EconomicComparisonTable.tsx:70-72`
  esconde la card entera si la lista viene vacia; si no, la nota al pie de
  `:148-153` es la que avisa del total nulo.

  Arreglo: aflojar el prompt, subir top-k, sacar el `break`, agregar fallback
  regex de montos.
  **Falta info:** necesito el caso real (propuesta con el USD 48.000).
  `id: MUnDhqFJI0yY-FXDT_DhmWQAPzZL`

---

## Grupo E - Auth y seguridad (5 tarjetas)

Todo vive en la UI con Supabase Auth via `@supabase/ssr`. La API de FastAPI no
tiene nada de login: grep de `password|sign_in|ratelimit` en
`accsa-licitaciones-api/app/` solo devuelve un comentario sobre el 429 de Azure
en `core/azure.py:30`.

- [ ] **CP-04** no permite recuperar contrasena. **Alta / M.** La mas critica
  del grupo.
  Hay un link, pero es decorativo: `src/app/login/page.tsx:104-118`, un
  `type="button"` que solo despliega el texto "Comunicate con el administrador de
  tu organizacion para restablecerla".
  **No existe flujo**: no hay ruta `/auth/reset-password`, ni una sola llamada a
  `resetPasswordForEmail` (grep de `olvid|forgot|recover|resetPasswordForEmail|
  restablec` en `src/` solo devuelve esas dos lineas). Las rutas de auth son
  `login`, `logout`, `me`, `heartbeat`, `set-password`.
  El admin tampoco tiene reset: `src/app/admin/config/users/page.tsx` solo ofrece
  cambio de rol, reenviar invitacion y borrar, y el reenvio es borrar+reinvitar y
  rechaza usuarios ya activos
  (`src/app/api/admin/users/[userId]/resend/route.ts:29-31`, `already_active`).
  `id: MM_KHqPgVkGXUMSXqNoPHGQAOf-F`

- [ ] **CP-03** no limita por intentos fallidos. **Media / M.**
  La UI solo pasa lo que devuelve GoTrue: `api/auth/login/route.ts:27-32` mapea
  `error.status === 429` a `too_many_attempts`, y `login/page.tsx:44-46` muestra
  "Demasiados intentos. Espere unos minutos".
  **No hay contador propio, ni throttle por email/IP, ni lockout tras N fallos**:
  sin Redis, sin contador de edge, sin tabla `attempts`. Grep de
  `ratelimit|throttl|lockout|attempts` en `src/` solo devuelve esas lineas del
  429, y en la API nada de auth.
  `id: Mp6zydn7SUGkHMcawP8Qn2QAJXSx`

- [ ] **CP-102** la sesion persiste al cerrar el navegador. **Media / S-M.**
  Las cookies de auth son **persistentes, no de sesion**: `@supabase/ssr` las
  escribe con `maxAge: 400 * 24 * 60 * 60` y ninguno de los dos clientes pasa
  `cookieOptions` para pisarlo (`src/lib/supabase/server.ts:7-27`,
  `src/lib/supabase/proxy.ts:49-69`).
  La mitigacion que si existe es el timeout de inactividad, enforced en el
  middleware (`src/lib/supabase/proxy.ts:96-121`, limpia todas las cookies `sb-*`
  y redirige a `/login?reason=timeout`) mas el watcher de cliente
  (`InactivityWatcher.tsx:51-58`), 30 min por defecto
  (`src/lib/session-timeout.ts:7-12`).
  La cookie `sb-activity` tiene 30 dias de max-age a proposito para que un
  reinicio la deje vieja (`session-timeout.ts:22-26`), pero eso solo fuerza
  logout si paso **mas** que la ventana. **Cerrar y reabrir en el momento sigue
  logueado, asi que la queja literal de QA sigue reproduciendo.** El changelog
  2.2.0 dice que se arreglo, pero lo que se arreglo fue la expiracion por
  inactividad, que es otra cosa.
  `id: IM4lMFcq-0e24fo37I5kBGQAICZt`

- [ ] **CP-103** permite sesiones multiples. **Media / L.**
  Cero logica de sesion unica: no hay registro ni tabla de sesiones, ni "current
  session id" en `app_metadata`, ni `signOut({ scope: 'global' | 'others' })`. El
  unico `signOut` es local (`api/auth/logout/route.ts:6`, scope por defecto = solo
  esta sesion). El login llama `signInWithPassword` sin invalidar nada previo
  (`api/auth/login/route.ts:25`) y el middleware solo valida claims del JWT, rol
  y ventana de inactividad (`src/lib/supabase/proxy.ts:73-135`).
  `id: vLNpcNMV1kOgkKtxPHggSGQAGovb`

---

## Plan de olas

### Ola 0 - Quick wins (1 item pendiente, 2 tarjetas)

Los otros cinco items de esta ola se resolvieron el 2026-08-13. Queda solo el
de prompts, bloqueado por falta del caso real para validar en el lab.

- [ ] CP-149 y parte de CP-150: editar los 2 prompts `compliance_evaluator` en
  `/admin/prompts` y validar en el lab. Cero codigo.

### Ola 2 - Ciclo de vida (4-5 dias, 4 tarjetas)

- [ ] CP-63/124 y CP-032: proxy y boton de reintento sobre el `retry-step` que ya
  existe, exponer el motivo del fallo, y que `normalizeStatus` maneje `failed`.

### Ola 3 - Seguridad (4-6 dias, 4 tarjetas)

- [ ] CP-04: flujo real de recuperacion de contrasena. La mas critica del grupo.
- [ ] CP-102: cookie de sesion.
- [ ] CP-03: throttle propio.
- [ ] CP-103: solo si se decide hacerla.

**Razon del orden:** con la subida resuelta, sigue la Ola 2.

---

## Info que hay que conseguir

| Tarjeta | Que falta |
|---|---|
| Cancelar analisis | Sin descripcion, y contradice una decision del 2026-07-13. Quien la pidio y que espera. |
| CP-149 y CP-150 | El pliego y la propuesta reales del caso, para reproducir y validar en el lab. |
