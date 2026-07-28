# Feature 07 — Correos por defecto + interruptor global (/admin/notifications)

Cubre ToDo item **7** ("Por defecto enviar correos cuando hay eventos").

Complejidad: **media** (config global app_settings + página admin + gate del envío).

---

## Estado actual

- `email_service.py` envía 3 correos (awaiting_approval / completed / failed) vía
  Mailgun, disparados por `_notify_by_email` en `job_orchestrator_service.py:592`.
- El envío hoy depende de que el análisis tenga `user_email` y de que el dominio
  sea el permitido (`_is_allowed`).
- Con la auth por sesión, **todos los análisis ya tienen `user_email`** = correo
  del usuario autenticado. O sea: en la práctica ya se manda por defecto, pero no
  hay un interruptor para apagarlo globalmente.

## Decisión cerrada (encuesta)

- **Activar el envío por defecto** para todos los análisis (ya ocurre, formalizarlo).
- Agregar un **interruptor global** para apagarlo, en una **página propia
  `/admin/notifications`** (solo admin).

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Sí  | No | Sí (seed app_settings) |

## Diseño (espeja `llm_config`)

### DB
- Nueva key en `app_settings` (ej. `notifications_config`) con
  `{ "email_enabled": true }` (default ON). Seed vía **MCP Supabase**.

### API
- `app_settings_service`: `get_notifications_config()` /
  `update_notifications_config()`. Schema `NotificationsConfig { email_enabled: bool }`.
- Endpoints `GET`/`PUT /api/v1/app-settings/notifications` (patrón `llm-config`).
- **Gate del envío**: en `_notify_by_email`, antes de mandar, chequear
  `app_settings_service.get_notifications_config().email_enabled`; si está off,
  registrar evento "notificación omitida (deshabilitada globalmente)" y salir.
  (Se mantiene el guard de dominio existente.)
- Auditar `notifications_config.update`.

### UI
- Página nueva `src/app/admin/notifications/page.tsx` (client, espeja
  `admin/llm-config/page.tsx`): toggle "Enviar correos de notificación" on/off.
- Proxy `src/app/api/admin/notifications/route.ts` (GET + PUT, `requireAdmin`,
  `getAuditHeaders`).
- Link "Notificaciones" en `src/app/admin/page.tsx`.
- env: posible `API_NOTIFICATIONS_CONFIG_PATH` en `lib/env.ts` + `.env.example`.

## Verificación

- `/admin/notifications` (solo admin) muestra y persiste el toggle.
- Con toggle ON: correr análisis → llegan los correos como hoy.
- Con toggle OFF: correr análisis → no se envía ningún correo; queda el evento de
  "omitido".
- Queda entrada en `/admin/audit`.
- `pnpm build` + import API OK.

## Relación

- Mismo patrón que Feature 06 (HITL global). **Implementarlos juntos**: comparten
  el molde app_settings + página admin + proxy + env workflow. Incluso podrían
  compartir un único endpoint de "settings" si se prefiere, pero el usuario pidió
  páginas separadas (`/admin/human-loop` y `/admin/notifications`).

## Nota

- El item 18 (correo de admisibilidad con resultado) y este se complementan: este
  controla SI se manda; el 18 controla QUÉ contiene el correo de admisibilidad.
