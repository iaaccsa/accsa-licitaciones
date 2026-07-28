# Feature 00 — Verificaciones de features ya implementadas

Cubre ToDo items **1, 6, 10, 11, 12** (y deja constancia de **2/3/4**, que no
requieren trabajo). Todos detectados como ya implementados en código. Este
"feature" no escribe código nuevo: es un checklist de verificación + cierre de
deploy pendiente.

Complejidad: **muy baja** (solo pruebas/QA y, donde aplique, deploy).

---

## Item 1 — Soporte de autenticación por correo `[verificar]`

Estado: implementado (Supabase Auth, invite-only, email+password, roles en
`app_metadata`). Decisión del usuario: **ya cubierto, marcar completado**; es lo
primero que va a probar. Los correos de auth (invitación/recupero) se envían con
el **servicio de mail integrado de Supabase** (no requiere Mailgun por ahora).

Verificar:
- Login root (`ia_admin@arnaldocastro.com.uy`) → entra; logout → corta sesión.
- Gating por rol: `user` no entra a `/admin/*` (redirect), admin sí.
- Invitación desde `/admin/users` a un correo del dominio permitido
  (`INVITE_ALLOWED_EMAIL_DOMAINS=arnaldocastro.com.uy`) → llega el mail (revisar
  spam) → `/auth/set-password` → setea password → entra.
- Reenvío de invitación (usuarios pendientes) funciona.
- Mail integrado de Supabase tiene rate limit (~2-4/h): suficiente para la prueba.

Pendiente operativo (no bloquea "completado"): SMTP custom (Mailgun, ver
`mailgun.md`) recién antes de invitar a gran escala en producción; vars en Vercel
(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
SUPABASE_SECRET_KEY, INVITE_ALLOWED_EMAIL_DOMAINS).

Ref: memoria `auth-supabase-design`, `feature-login.md`, `mailgun.md`.

---

## Item 6 — Quitar el correo de la vista de "nuevo análisis" `[verificar]`

Estado: hecho. `UploadSection.tsx` no pide correo; el proxy `POST /api/analyses`
inyecta `user_email` y `created_by` desde la sesión (server-side), sobrescribiendo
cualquier valor del browser.

Verificar:
- `/` (subida) no muestra campo de correo.
- Un análisis nuevo queda con `user_email` = correo del usuario autenticado.
- El correo de notificación llega a ese usuario.

Ref: memoria `feature-analyses-by-user` (FASE 2).

---

## Item 10 — Auditoría de eventos. Solo lectura `[verificar]`

Estado: hecho. `/admin/audit` (tabla `audit_logs`) es un visor solo-lectura de
acciones de usuario (crear, borrar, descargar, override de admisibilidad, editar
requisito/compliance, cambios de config). Decisión del usuario: **ya cubierto**.

Verificar:
- `/admin/audit` lista acciones con filtros + paginación; solo admin entra.
- Una acción auditada (ej. override de admisibilidad o editar config) aparece con
  `user_email`, `action`, `resource`, timestamp.
- Append-only: no hay forma de editar/borrar entradas desde la UI.

Pendiente de deploy (de la feature original): imagen API + var Vercel
`API_AUDIT_LOGS_PATH`.

Ref: memoria `feature-audit-logs`, `spec-audit.md`.

---

## Item 11 — Cada usuario ve solo sus análisis; el admin ve todos `[verificar]`

Estado: hecho. `analyses.created_by` + filtro por usuario; admin usa `?scope=all`.
Toda ruta `/api/analyses/[id]/*` valida acceso (`requireAnalysisAccess`, 404 a
ajenos).

Verificar (multi-cuenta):
- Usuario A no ve análisis de Usuario B en `/analyses`; admin ve todos.
- Acceso directo por id a un análisis ajeno → 404.
- Entidades hijas (files/requirements/compliance) también 404 a ajenos.

Pendiente de deploy (de la feature original): push API + UI a Vercel.

Ref: memoria `feature-analyses-by-user`.

---

## Item 12 — Subir Tier 4 en OpenAI `[completado]`

Decisión del usuario: **ya está listo, marcar completado**. Tarea operativa de
cuenta (sin código). No queda nada por hacer en el repo.

---

## Items 2/3/4 — Área de configuración / mover prompts y LLM `[sin trabajo]`

Decisión del usuario: el item estaba **mal descrito**; tal como están hoy las
rutas (`/admin/prompts` y `/admin/llm-config`) **está OK**. No se crea
`/admin/config` ni se mueve nada. No requieren feature ni cambios.

Nota: lo único que sí sale de "config" es HITL (item 5 → `/admin/human-loop`) y
el toggle de notificaciones (item 7 → `/admin/notifications`), que tienen sus
propios features.
