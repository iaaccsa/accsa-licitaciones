# Feature 06 — HITL global (configurable en /admin/human-loop)

Cubre ToDo item **5** ("Mover la configuración de HITL ó HOTL para /config").

Complejidad: **media** (config global tipo app_settings + página admin + quitar
toggle de subida + leer el global en la creación del análisis).

---

## Estado actual

- HITL es **por análisis**: toggle "Con/Sin validación humana" en
  `UploadSection.tsx` (`hitl` boolean). Se manda en `POST /api/analyses` y se usa:
  - `analysis_service.create_analysis_from_storage`: `"hitl": data.hitl` +
    `workflow_phase_service.initialize_phases(analysis.id, data.hitl)`
    (`analysis_service.py:31,56`).
- Existe el patrón de **config global** en la tabla `app_settings`:
  `app_settings_service.get_llm_config()` (key `llm_config`), expuesto en
  `/admin/llm-config` (proxy `requireAdmin` → API `X-API-Key`). Mismo molde a
  reusar.

## Decisión cerrada (encuesta)

- HITL pasa a ser **global** (un default para todos los análisis nuevos).
- Se configura en una **página nueva `/admin/human-loop`** (solo admin).
- Se **quita el toggle por análisis** de la vista de subida.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Sí  | No | Sí (seed app_settings) |

## Diseño (espeja `llm_config`)

### DB
- Nueva key en `app_settings` (ej. `hitl_config` o `human_loop`) con
  `{ "hitl": false }` (default). Seed vía **MCP Supabase** (`app_settings` ya
  tiene RLS on / 0 policies; service_role bypassa).

### API
- `app_settings_service`: `get_hitl_config()` / `update_hitl_config()` (espeja
  `get_llm_config`). Schema `HitlConfig { hitl: bool }`.
- Endpoints: `GET`/`PUT /api/v1/app-settings/hitl` (o sumar a un endpoint de
  settings existente), patrón de `llm-config`.
- `create_analysis_from_storage`: dejar de tomar `hitl` del request; leerlo del
  global → `hitl = app_settings_service.get_hitl_config().hitl`. Usar ese valor en
  el snapshot del análisis y en `initialize_phases`.
- `AnalysisFromStoragePath`: quitar el campo `hitl` (o ignorarlo). Auditar
  `hitl_config.update` (patrón audit-logs).

### UI
- `UploadSection.tsx`: eliminar el bloque "Validación" (botones Con/Sin validación
  humana), el estado `hitl`/`setHitl` y su envío en el body.
- Página nueva `src/app/admin/human-loop/page.tsx` (client, espeja
  `admin/llm-config/page.tsx`): toggle global HITL on/off, guarda vía proxy.
- Proxy `src/app/api/admin/human-loop/route.ts` (GET + PUT, `requireAdmin`,
  `getAuditHeaders`).
- Link "Human-in-the-loop" en `src/app/admin/page.tsx`.
- env: nueva var si el path se parametriza (ej. `API_HITL_CONFIG_PATH`) en
  `lib/env.ts` + `.env.example` (workflow `env-example-workflow`).

## Verificación

- `/admin/human-loop` (solo admin) muestra y persiste el toggle global.
- Subida `/` ya no muestra el toggle de validación.
- Análisis nuevo toma `hitl` del global: con HITL on hay pausa de aprobación; con
  off corre sin pausas.
- Cambiar el global afecta a los análisis nuevos (no retroactivo; el snapshot ya
  quedó en cada análisis).
- Queda entrada en `/admin/audit`.
- `pnpm build` + import API OK.

## Relación

- Mismo patrón que Feature 07 (notificaciones global). **Conviene implementarlos
  juntos**: ambos son "config global vía app_settings + página admin nueva +
  gate de comportamiento". Comparten molde, proxy pattern y env workflow.
