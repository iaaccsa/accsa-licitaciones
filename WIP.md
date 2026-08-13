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
| Bug real, confirmado en codigo | 16 |
| Ya resuelto (cerrar) | 2 |
| No es bug: configuracion o decision de producto | 2 |
| Tarea de testing, no de desarrollo | 1 |
| Necesita mas informacion antes de tocar codigo | 4 |

**5 tarjetas distintas son el mismo bug de fondo**: TC-CLI-118/121/126/127,
CP-51/32 y CP-155 salen todas del diseno de subida en el navegador.

---

## Decisiones pendientes (bloquean el plan)

- [ ] **Orden de ataque.** Opciones: (a) Ola 0 primero, 6 quick wins en 2-3 dias;
  (b) subida primero, 5-8 dias sin cerrar otras tarjetas; (c) parche de subida
  de medio dia y despues Ola 0. Recomendacion: (a), o (c) si QA esta parado.
- [ ] **Cancelar analisis.** Se removio a proposito el 2026-07-13 (commits
  `0f4932f` y `5545506`). La tarjeta no tiene descripcion. Averiguar quien la
  pidio y que espera: matar los jobs en curso u ocultar el analisis.
- [ ] **CP-00 dominios.** Es config (`INVITE_ALLOWED_EMAIL_DOMAINS`), no codigo.
  Decidir si se vacia la variable, se suman dominios puntuales, o se devuelve a
  QA como decision de producto.
- [ ] **CP-103 sesion unica.** Complejidad L, no hay nada de infraestructura hoy.
  Confirmar si es requisito real o una observacion de QA.
- [ ] **CP-102 alcance.** Fijar `cookieOptions.maxAge` a sesion cierra la queja
  literal, pero mata cualquier "recordarme" futuro. Confirmar.

---

## Para cerrar ya

### Ya resueltas

- [ ] **CP-11** criterio de contrasena. Ya esta en
  `accsa-licitaciones-ui/src/app/auth/set-password/page.tsx:89-92`: "Minimo 6
  caracteres. Se admiten letras (a-z, A-Z), numeros (0-9) y simbolos...", mas
  `minLength={6}` (`:86`, `:109`) y mapa de errores en espanol (`:8-12`). El
  servidor valida lo mismo en `api/auth/set-password/route.ts:5`.
  Commit relacionado: `05009bd`.
  `id: zJJYbPj2-kGXU2x26OCfKGQANHIx`

- [ ] **CP-16 y CP-17** L&F en login. Ya esta:
  `src/components/Navbar.tsx:15-39` renderiza `/images/logo-square.png`
  (`:29-35`) mas el titulo, en modo "minimal" sobre `/login` y `/auth/*`
  (`:18`, `:41-44`). El Navbar monta en todas las rutas
  (`src/app/layout.tsx:38`).
  **Salvedad:** la marca visible dice "Asistente de Compras Estatales", no
  "Licitaciones", y la tarjeta del login en si no lleva logo (solo el header
  "Iniciar Sesion", `login/page.tsx:61`). Confirmar con QA antes de cerrar.
  `id: AA87Q1toEU-QNuaZ8o_LY2QABfMp`

### No son bugs

- [ ] **CP-00 (v2)** no permite crear usuarios fuera de ACCSA. Intencional y
  configurable: `src/app/api/admin/users/invite/route.ts:32-39` lee
  `INVITE_ALLOWED_EMAIL_DOMAINS`, separa por coma y devuelve 400
  `domain_not_allowed`. Declarada en `src/lib/env.ts:32`, valor actual
  `arnaldocastro.com.uy` (`.env.local:39`, `.env.example:56`). Documentado en
  `features/done/00-verificaciones.md:22-24`. Ojo `:37`: **si la variable esta
  vacia el chequeo se saltea entero**. El valor de produccion hay que mirarlo en
  Vercel, no en el repo.
  `id: IRIsMy3f_kGBgtHn3JuCXmQACdHe`

- [ ] **ID 212** testing de 500 archivos / 1 GB. No es un bug: es el caso de
  prueba que genero los TC-CLI. Se cierra cuando se resuelva el grupo de subida.
  `id: CtuhIdGXmEav-6-Q1get8WQAKtgU`

---

## Grupo A - Subida de archivos (5 tarjetas)

### Causa raiz unica

En `accsa-licitaciones-ui/src/components/UploadSection.tsx:48-73`:

- Lazy `import("jszip")` (`:48-49`, jszip `^3.10.1`).
- Loop `await file.arrayBuffer()` por archivo y `zip.file(name, buffer)`
  (`:51-54`). Cada PDF queda materializado entero en el heap **ademas** del
  handle `File`. Sin `streamFiles`, sin chunking.
- `zip.generateAsync({ type: "blob" })` (`:56`). Sin callback `onUpdate` (JSZip
  lo soporta), sin compresion, o sea STORE: el ZIP pesa la suma de los PDFs.
  Pico de memoria aproximado: 2x el total de bytes.
- **No hay validacion de tamano total en ningun lado.** Los unicos chequeos son
  por archivo (10 MB) en `FileUploadZone.tsx:66-70` y el corte a `maxFiles` en
  `:80`. Con 500 x 10 MB permitidos, una seleccion legal llega a ~5 GB.
- Un solo `fetch` directo a Supabase Storage REST (`:63-73`),
  `POST {SUPABASE_URL}/storage/v1/object/artifacts/{uuid}.zip` con la anon key.
  Es el upload single-shot: **no** es signed URL, **no** es TUS/resumable.
  Esto si esquiva bien el limite de 4.5 MB de Vercel (los bytes nunca pasan por
  Next). Ver `accsa-licitaciones-ui/docs/UPLOAD_SIZE_ALTERNATIVES.md`.
- Sin barra de progreso: solo un spinner "Enviando..." (`:184-188`). `fetch` no
  expone progreso de subida y no hay XHR ni `ReadableStream` en todo `src/`.
- Cuando el tab se queda sin memoria, el `try/catch` de `:103` **no lo captura**.
  Un OOM de JS no es catcheable. Por eso el sintoma es "el boton desaparece y no
  pasa nada", no un error mal manejado.

Aguas abajo: `service-file-extractor/main.py:306` hace
`requests.get(url, timeout=300).content`, o sea el ZIP entero a RAM, dentro de un
contenedor limitado a `EXECUTOR_MEMORY = "1536m"`
(`accsa-licitaciones-executor/app/config.py:25`). Un ZIP de ~1 GB revienta ahi
por memoria o por el timeout de 300 s.

### Hallazgos extra no reportados

- **`Dockerfile` de la UI (lineas 16-28) no declara
  `NEXT_PUBLIC_MAX_UPLOAD_FILES`**, aunque `.github/workflows/build-ui.yml:46-47`
  reenvia todas las `NEXT_PUBLIC_*` de `ui-build.env` como build args. Como se
  inlinean en build time, los contenedores siempre toman el fallback 500. El
  limite "configurable" del commit `c258c7e` esta fijo en produccion.
- **Truncado silencioso**: `FileUploadZone.tsx:80` descarta todo lo que pase de
  `maxFiles` sin avisar.
- **Colision de nombres silenciosa**: `UploadSection.tsx:53` aplana la ruta, asi
  que dos PDFs con el mismo nombre en carpetas distintas se pisan en el
  `extractall` (`service-file-extractor/main.py:320-321`).
- **Codigo muerto**: `src/app/api/upload-token/route.ts` y el backend
  `app/api/v1/endpoints/upload_token.py` + `app/core/upload_tokens.py`
  implementan un flujo con token que ningun cliente llama.

### Tarjetas

- [ ] **TC-CLI-118/127** se traba al preparar los archivos, la capacidad
  500 / 1 GB no es usable con tamanos reales. **Bloqueante.**
  `id: gvcDB19NyEqupL2mU792e2QAGsED`
- [ ] **TC-CLI-121** lotes bajo 1 GB no suben ni informan error. **Bloqueante.**
  Parcial: los errores del camino feliz si se muestran
  (`UploadSection.tsx:75-79`, `:99-102`, `:103-107`), pero quedan caminos mudos.
  El mas grave es del lado del servidor:
  `accsa-licitaciones-api/app/services/analysis_service.py:65-68` solo loguea las
  excepciones de `start_pipeline()` y el endpoint igual devuelve 200. La UI
  muestra "Analisis iniciado con exito" mientras el analisis queda `pending` para
  siempre. Los diagnosticos son solo `console.error` (`:104`); el status y el
  body de Storage nunca se leen ni se muestran.
  `id: SLQWMVwJokq8f34f36-vz2QAIntE`
- [ ] **TC-CLI-126** al superar 1 GB se cuelga sin el error esperado. **Alta.**
  `id: V8t7zujHMEu4GcIIim4lB2QAPNv-`
- [ ] **CP-155** cargar documentos y desconectar red. **Media.** Cero maquinaria
  de reintento: no hay `retry`, `AbortController`, `tus`, `resumable` ni
  `uploadToSignedUrl` en `src/`. Un solo `fetch`; al fallar se descarta el ZIP y
  hay que rearmar todo. Agravante: `InactivityWatcher.tsx:51-58` fuerza
  navegacion a `/login?reason=timeout` a los 30 min de inactividad
  (`src/lib/session-timeout.ts:8-12`), y el timer solo se resetea con
  pointer/key/scroll, asi que una subida larga desatendida se mata sola sin
  mostrar error.
  **Falta definir:** el resultado esperado es ambiguo. Reanudar solo al volver la
  red, o avisar y permitir reintentar sin rearmar todo. Cambia el alcance.
  `id: 31Fy4ecE1kqR1l4W3NIRfmQACi_g`
- [ ] **CP-51 y 32** 25 documentos y se queda cargando. **Media.** Es de cuando
  el limite era 25. Mitigaciones ya aplicadas: 25 -> 50 -> 500 (`4ab43f5`,
  `c258c7e`) y timeout de job 3600 s -> 21600 s (`executor/app/config.py:26-29`,
  aplicado en `app/runner.py:160-177`). Sigue sin resolverse: no hay watchdog de
  jobs colgados en toda la API (grep de watchdog/stuck/stale sin resultados), el
  fallo de arranque del pipeline se traga, la concurrencia del executor es 3 con
  1.5 GB y 1 vCPU por job (`config.py:22-25`), y la descarga del extractor sigue
  bufferizada. Un lote grande que se cuelga no llega nunca a un estado de fallo.
  **Necesita re-test antes de gastar tiempo.**
  `id: C0_tUop0Zkeo6zHtSSX6D2QAHaZQ`

### Plan de arreglo

- [ ] **Parche de feedback (S, medio dia).** Validar tamano total antes de
  zipear con mensaje claro, y barra de progreso usando el callback `onUpdate` de
  JSZip. No arregla el bug de fondo, pero elimina el cuelgue mudo de TC-CLI-126.
- [ ] **Rework (L, 4-6 dias).** Dejar de armar el ZIP en el navegador: subir
  archivo por archivo a Storage con upload resumable (TUS), concurrencia
  limitada y progreso real. El backend arma o lee el lote.
- [ ] **Streaming en `file-extractor` (M).** Bajar a disco en vez de a RAM.
- [ ] **Fix del `Dockerfile`** de la UI: declarar `NEXT_PUBLIC_MAX_UPLOAD_FILES`.
- [ ] **Superficie de error del servidor**: que `analysis_service.py:65-68` deje
  de tragarse la excepcion de `start_pipeline()`.

---

## Grupo B - Estado y ciclo de vida del analisis (5 tarjetas)

- [ ] **CP-28** el estado no coincide con el progreso real. **Alta / M.**
  Hay dos fuentes de verdad que nadie reconcilia:
  - El porcentaje se calcula en el cliente promediando las fases en
    `processing`: `src/components/WorkflowPhases.tsx:232-237`, se pinta en
    `:266-274`.
  - El rotulo sale de `analysis.status` / `is_success`:
    `src/app/analyses/[id]/page.tsx:218-221` y `:466-470`.
  - Desajuste concreto: cuando ninguna propuesta pasa admisibilidad el backend
    escribe `{"status": "ready", "is_success": True}`
    (`job_orchestrator_service.py:680-684` y `:706-711`) **despues** de llamar a
    `apply_admissibility_cut`, que a proposito deja la ultima fase en
    `status: "pending", progress: 0` (`workflow_phase_service.py:172-184`). Con
    las 5 fases de `app/config/phases_config.json`, una en cero da 80%; una a
    medias (`progress = int(completed/total*100)`,
    `workflow_phase_service.py:64`) baja a ~75%. Mismo efecto en el camino de
    fallo (`:115-116`, `:171`), que marca `ready` con fases incompletas.
  - Lo de "pierde el formato": el div de la barra tiene `min-w-fit` junto al
    `style={{ width: X% }}` (`WorkflowPhases.tsx:266-274`), asi que con
    porcentajes chicos el relleno se dibuja mas ancho que el progreso real. Es
    de todos los navegadores, no de algunos.
    **Falta info:** QA dice "en algunos navegadores". Preguntar cuales, puede
    haber un segundo problema.
  `id: weNq1Vb8nEiPNaC9vSDNzWQACAkR`

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
  **Falta info:** la descripcion es generica y tiene "Evidencias Adjuntas" que el
  CLI de Graph no baja. Necesito el id del analisis o la captura para saber que
  paso revento. Puede ser el mismo bug de subida o algo distinto.
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

- [ ] **No muestra el nombre, solo un codigo.** **Alta / M.**
  El `375da665` es el `slug` de la tabla:
  `supabase-backup/...20260624_112015.sql:458` ->
  `"slug" character(8) DEFAULT substr(md5(gen_random_uuid()::text), 1, 8)`.
  Cadena de fallback `user_assigned_name || generated_name || slug` en
  `AnalysisCard.tsx:40`, `analyses/[id]/page.tsx:266-268`,
  `AnalysisBreadcrumb.tsx:61`, `admin/analyses/[id]/page.tsx:129`.
  El nombre real si se extrae, pero recien en el 6o paso del DAG:
  `service-documents-grouper/main.py:322-382` (`generate_tender_info` ->
  `NAMING_PROMPT` -> `PATCH /analyses/{id}` con `generated_name` en `:373-376`),
  consumido por `app/api/v1/endpoints/analyses.py:158-172`.
  Entonces se ve el hex cuando: (a) el analisis no llego todavia a
  `documents-grouper`, (b) fallo antes, o (c) el LLM devolvio vacio
  (`main.py:379-380` solo loguea un warning, sin fallback). No hay campo de
  nombre al crear (`UploadSection.tsx` solo postea el ZIP, `src/app/new/page.tsx`
  no tiene input), asi que `user_assigned_name` arranca siempre NULL.
  `id: P1hi6OYm40aVPDzcELqbKmQAHKWq`

---

## Grupo C - Admisibilidad (2 tarjetas)

- [ ] **CP-154** al rechazar una propuesta sigue visualizandose. **Alta / S.**
  Mejor relacion costo/beneficio del lote.
  El override manual escribe solo las dos columnas de estado, sin cascada y sin
  guarda sobre el estado del analisis (asi que se puede hacer despues de
  terminado):
  - UI: `src/app/analyses/[id]/admissibility/page.tsx:53-77` y el mismo handler
    en `proposals/page.tsx:126-150`.
  - Proxy: `src/app/api/analyses/[id]/proposals/[proposalId]/admissibility-override/route.ts`
  - API: `app/api/v1/endpoints/proposals.py:97-99` ->
    `app/services/proposal_service.py:190-206`, setea `admissibility_status` y
    `admissibility_overridden_by` y nada mas.

  Ninguno de los dos consumidores filtra:
  - **Resumen de Propuestas**: `src/components/ProposalsSummary.tsx:40` usa
    `useProposals` (`src/lib/use-proposals.ts:9-13`) ->
    `app/api/v1/endpoints/analyses.py:82-83` ->
    `app/repositories/proposal_repository.py:10-19` (`proposals_view`, filtrado
    solo por `analysis_id`). `admissibility_status` ni figura en la interfaz
    `Proposal` del componente (`:7-13`), y el loop de render (`:76`) mapea todo.
  - **Comparativa de Ofertas Economicas**:
    `src/components/EconomicComparisonTable.tsx:24-38` ->
    `app/api/v1/endpoints/economic_offers.py:30-31` ->
    `app/repositories/economic_offer_repository.py:30-46`, que filtra solo por
    `analysis_id` / `currency` / `is_verified` / `requires_manual_review`. La
    tabla renderiza todas las ofertas (`:106`) y solo joinea `proposals` para
    `label` y `provider_name` (`:107`, `:116`, `:119`).

  El filtro correcto **ya existe** y lo usa el orquestador:
  `proposal_repository.get_admitidas_by_analysis_id` (`:29`). Solo hay que
  aplicarlo en esas dos vistas.
  `id: pXHmsOlVp0uJjeR0dxIXB2QAOG-t`

- [ ] **CP-42** aunque no tenga admisibles se ve como aprobado y completado.
  **Alta / M + S.** Son dos cosas.

  Lo que ya funciona (corte de backend):
  - Cero requisitos extraidos -> corta el pipeline
    (`job_orchestrator_service.py:205-212`).
  - Cero propuestas `admitida` tras el gate -> corta en `:245-252` (sin HITL) y
    `:564-571` (al reanudar con HITL).
  - Pintado de fases: `_complete_downstream_and_finalize` (`:679`) ->
    `workflow_phase_service.apply_admissibility_cut` (`:151-184`) deja
    `award_check` en `warning` y resetea `final_compliance_check` a pending. La
    UI lo muestra como nodo ambar "Sin admisibles"
    (`WorkflowPhases.tsx:33`, `:55`, `:121-122`).

  Lo que falta:
  1. El analisis igual se finaliza como exito:
     `job_orchestrator_service.py:681-684` escribe
     `{"status": "ready", "is_success": True}` (idem `:708-711`), y la cabecera
     pinta un "Completado" verde (`analyses/[id]/page.tsx:466-470`). No hay
     estado propio ni cartel; la unica explicacion queda en un evento.
  2. El caso "sin requisitos de admisibilidad" reusa la etiqueta equivocada:
     `apply_admissibility_cut` pinta "Sin admisibles" aunque la causa real sea
     cero requisitos extraidos.
  3. **Bug real no reportado, y reproduce el sintoma de QA.** El gate carga solo
     requisitos con `is_verified=true`
     (`service-admissibility-gate/main.py:187-193`) y, si no encuentra ninguno,
     **auto-admite todas las propuestas** (`:282-290`,
     `mark_admissibility_result(..., "admitida", [])`). El corte de la API en
     cambio consulta **sin** ese filtro
     (`app/repositories/admissibility_requirement_repository.py:23-39`). O sea:
     si en la pausa HITL el usuario desmarca todos los requisitos (hay accion
     masiva, `admissibility-requirements/page.tsx:233`), la API no corta, el gate
     admite todo, y el analisis termina completamente en verde.
  4. Ya esta anotado como pendiente en
     `features/backlog/analisis-sin-requisitos-admisibilidad.md:32-45`.
  `id: dV7rNbHwoUCiQgv3gKz4_2QAKOJh`

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

## Grupo E - Auth y seguridad (6 tarjetas)

Todo vive en la UI con Supabase Auth via `@supabase/ssr`. La API de FastAPI no
tiene nada de login: grep de `password|sign_in|ratelimit` en
`accsa-licitaciones-api/app/` solo devuelve un comentario sobre el 429 de Azure
en `core/azure.py:30`.

- [ ] **CP-18** no permite ver los caracteres de la contrasena. **Baja / S.**
  Login: `src/app/login/page.tsx:93-102`, `type="password"` hardcodeado.
  Set password: `src/app/auth/set-password/page.tsx:77-88` y `:101-110`, los dos
  hardcodeados. Grep de `showPassword|EyeOff|type={show` en `src/`: cero.
  `id: WKY-ZaqYakOOQ9JHJXa8xWQAF2d1`

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

## Grupo F - UX menor (2 tarjetas)

- [ ] **CP-113** no permite busqueda ni ordenamiento. **Media / S.**
  La lista principal es `/` -> `src/app/page.tsx:7-25` (solo un link "Nuevo
  analisis"; `/analyses` redirige a `/`, `src/app/analyses/page.tsx:3-5`).
  `src/components/AnalysisList.tsx` no tiene ni input, ni select, ni control de
  orden. Solo: orden fijo por `created_at` desc (`:88-91`), split fijo en
  "En Curso" / "Completados" (`:93-98`) y paginacion (`:100-105`, `:140-176`).
  El backend tampoco: `GET /` filtra solo por `created_by`
  (`app/api/v1/endpoints/analyses.py:26-34`) y el proxy
  `src/app/api/analyses/list/route.ts` solo pasa `scope`.
  Mismo caso en el admin (`src/app/admin/analyses/page.tsx` usa el mismo
  componente).
  Como la lista ya se pagina en cliente, filtrar y ordenar del lado del cliente
  alcanza.
  `id: jvqitmTSH0G-dyoa29S35WQAKO4j`

- [ ] **CP-29** al editar el nombre no permite modificarlo. **Media / S.**
  Las dos mitades de la queja son ciertas.
  El input si es controlado (`value={nameDraft}` + `onChange`,
  `src/app/analyses/[id]/page.tsx:229-241`), pero el borrador se siembra solo
  desde `user_assigned_name`:
  `setNameDraft(analysis.user_assigned_name ?? "")` (`:115-119`). Como el titulo
  visible es `user_assigned_name || generated_name || slug` (`:266-268`), para
  cualquier analisis nombrado por la IA (el caso normal: no hay campo de nombre
  al subir) el lapiz abre una caja **vacia** con el nombre actual solo como
  `placeholder` (`:239`). Hay que retipear todo.
  El nombre viejo debajo tambien sigue: `:279-283` renderiza `generated_name`
  como subtitulo siempre que haya `user_assigned_name`.
  El refresco esta bien: `mutate(..., { revalidate: false })` (`:132-137`) es
  optimista sobre `/api/analyses/${id}`, key que comparte el breadcrumb
  (`AnalysisBreadcrumb.tsx:48-50`), y la lista (`AnalysisList.tsx:22-41`)
  refetchea al remontar. Lo que se ve viejo es el subtitulo `generated_name`.
  `id: 6fEcubCsHUShPBUY4IboGmQAMoqN`

---

## Plan de olas

### Ola 0 - Quick wins (2-3 dias, 5 tarjetas restantes)

Todo S, sin dependencias entre si, alto impacto visible en la proxima ronda de QA.

- [ ] CP-149 y parte de CP-150: editar los 2 prompts `compliance_evaluator` en
  `/admin/prompts` y validar en el lab. Cero codigo.
- [ ] CP-154: filtrar por `admissibility_status` en `ProposalsSummary` y
  `EconomicComparisonTable`.
- [ ] CP-42 (mitad bug): alinear el filtro `is_verified` entre el gate y el corte
  de la API.
- [ ] CP-29: sembrar el borrador con el nombre visible y sacar el subtitulo
  duplicado.
- [ ] CP-113: buscador y orden en cliente.
- [ ] CP-18: toggle de ojito en los 3 campos de contrasena.

### Ola 1 - Subida (5-8 dias, 5 tarjetas)

- [ ] Parche de feedback (medio dia) para desbloquear a QA.
- [ ] Rework a subida por archivo con TUS.
- [ ] `file-extractor` bajando en streaming.
- [ ] Fix del `Dockerfile` (`NEXT_PUBLIC_MAX_UPLOAD_FILES`).
- [ ] Dejar de tragarse la excepcion de `start_pipeline()`.

Cierra TC-CLI-118/121/126/127, CP-155, CP-51/32 e ID 212.

### Ola 2 - Ciclo de vida (4-5 dias, 4 tarjetas)

- [ ] CP-28: reconciliar progreso con estado, y el `min-w-fit`.
- [ ] CP-63/124 y CP-032: proxy y boton de reintento sobre el `retry-step` que ya
  existe, exponer el motivo del fallo, y que `normalizeStatus` maneje `failed`.
- [ ] CP-42 (mitad UX): estado o cartel propio para "terminado sin admisibles".
- [ ] Nombre hex: fallback temprano.

### Ola 3 - Seguridad (4-6 dias, 4 tarjetas)

- [ ] CP-04: flujo real de recuperacion de contrasena. La mas critica del grupo.
- [ ] CP-102: cookie de sesion.
- [ ] CP-03: throttle propio.
- [ ] CP-103: solo si se decide hacerla.

**Razon del orden:** la Ola 0 sale casi gratis y limpia 6 tarjetas, y la Ola 1 es
lo que hoy impide a QA probar cualquier otra cosa con volumen real.

---

## Info que hay que conseguir

| Tarjeta | Que falta |
|---|---|
| Cancelar analisis | Sin descripcion, y contradice una decision del 2026-07-13. Quien la pidio y que espera. |
| CP-032 | Descripcion generica. Tiene evidencias adjuntas que el CLI de Graph no baja. Necesito el id del analisis o la captura. |
| CP-51 y 32 | Es de cuando el limite era 25. Re-test antes de gastar tiempo. |
| CP-149 y CP-150 | El pliego y la propuesta reales del caso, para reproducir y validar en el lab. |
| CP-155 | El resultado esperado es ambiguo: reanudar solo, o avisar y reintentar sin rearmar. |
| CP-28 | "En algunos navegadores pierde el formato": cuales. El bug de `min-w-fit` es de todos, puede haber un segundo problema. |
| CP-16 y CP-17 | Confirmar si el logo actual mas "Asistente de Compras Estatales" alcanza, o exigen la palabra "Licitaciones". |
