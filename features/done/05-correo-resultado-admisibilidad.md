# Feature 05 — Correo de la etapa de admisibilidad con el resultado

Cubre ToDo item **18** ("Agregar a la notificación de la etapa de admisibilidad
que el correo envíe la información del resultado de la admisibilidad").

Complejidad: **media** (plantilla de correo + recolección de datos en API).

---

## Estado actual

- `email_service.py` (API) envía 3 correos vía Mailgun: `send_awaiting_approval`,
  `send_pipeline_completed`, `send_pipeline_failed`. Plantillas en
  `app/email_templates/*.html` (solo interpolan `{{analysis_url}}`).
- El disparo es `_notify_by_email(analysis_id, reason)` en
  `job_orchestrator_service.py:592`. El correo de la etapa de admisibilidad es el
  de **`awaiting_approval`** (la pausa HITL ocurre en el gate de admisibilidad).
- Hoy ese correo NO incluye el resultado: solo dice "pendiente de aprobación" +
  link.
- El resultado de admisibilidad por propuesta vive en `proposals`
  (`admissibility_status`: `admitida`/`rechazada`) y el detalle en
  `admissibility_results` (por requisito).

## Decisión cerrada (encuesta)

**Extender el correo de la etapa** (`awaiting_approval`): agregar la lista de
propuestas **admitidas/rechazadas** y el **motivo** del rechazo.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| No | Sí  | No       | No |

## Diseño

### API
- En `_notify_by_email` (rama `awaiting_approval`), antes de enviar, recolectar el
  resumen de admisibilidad del análisis:
  - Propuestas con su `admissibility_status` (admitida/rechazada) — desde
    `proposals` del análisis.
  - Motivo por propuesta rechazada: derivar de `admissibility_results` los
    requisitos **obligatorios** no cumplidos (verdict != `cumple`) → texto corto
    (ej. "Rechazada: incumple ADM-003, ADM-007"). Reusar la lógica de
    "solo obligatorias bloquean" descrita en memoria `path2-reorder-status`.
- `email_service.send_awaiting_approval(analysis_id, user_email, summary)`:
  agregar parámetro con el resumen y renderizarlo en la plantilla.
- Plantilla `awaiting_approval.html`: agregar bloque que liste admitidas (verde) y
  rechazadas (con motivo). Mantener el `{{analysis_url}}`. Usar un placeholder
  nuevo (ej. `{{admissibility_block}}`) generado server-side, o cambiar el render
  a algo que arme la tabla (el render actual es un `replace` simple; basta con
  inyectar HTML pre-armado en un placeholder).

Archivos:
- `accsa-licitaciones-api/app/services/email_service.py`
- `accsa-licitaciones-api/app/email_templates/awaiting_approval.html`
- `accsa-licitaciones-api/app/services/job_orchestrator_service.py`
  (`_notify_by_email`: armar el summary)
- posible helper para construir el resumen (reusar repos de proposals /
  admissibility_results).

## Verificación

- Correr un análisis HITL con propuestas mixtas (alguna admitida, alguna
  rechazada): el correo de "pendiente de aprobación" llega con la lista
  admitidas/rechazadas + motivo.
- Caso todas admitidas / todas rechazadas se renderiza correcto (sin secciones
  vacías rotas).
- Import API OK; envío real verificado contra Mailgun (o stub).

## Notas / dependencias

- El usuario eligió **extender el correo de la etapa** (no un correo nuevo). En
  HOTL no hay pausa → no se dispara `awaiting_approval`. Si más adelante se quiere
  el resultado por correo también en HOTL, es un correo nuevo aparte (fuera de
  alcance de este feature).
- Relación con Feature 04 (corte por admisibilidad): si ninguna pasa, el correo
  igual debe poder comunicar "ninguna admitida" de forma clara.
