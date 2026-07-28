# Feature 04 — Corte por admisibilidad: último estado no-completado + admisibilidad en amarillo

Cubre ToDo items **16** ("Si no llega hasta el final porque no pasa ninguna la
admisibilidad, no marcar el último estado como completado") y **17** ("Si ninguno
pasa la admisibilidad, marcar ese estado en amarillo"). Se implementan juntos:
son el mismo escenario (ninguna propuesta admitida) visto desde dos ángulos.

Complejidad: **media** (lógica de orquestación/estado en API + color nuevo en UI).

---

## Estado actual

- Cuando **ninguna** propuesta pasa la admisibilidad, el pipeline corta antes del
  final. Según memoria `path2-reorder-status`: el orquestador generaliza la rama
  de "items vacíos" y, si todas rechazadas, **el análisis finaliza en `ready`**
  (cascada de steps con `instances_count=0`).
- Problema 16: en ese corte, el **último estado/fase** puede quedar marcado como
  `completed`, dando la falsa impresión de que el flujo terminó normal.
- Problema 17: el estado de **admisibilidad** no se distingue visualmente; debería
  avisar (amarillo) que ninguna propuesta pasó.
- `WorkflowVisualization.tsx` hoy NO tiene color amarillo: estados soportados
  `pending` (blanco) / `running` (blanco) / `completed` (azul) / `failed` (rojo) /
  `success` / `processing`. No hay `warning`.

## Decisión cerrada (encuesta)

**Ambos comportamientos**:
- El estado de **admisibilidad** se pinta en **amarillo** (advertencia) cuando
  ninguna propuesta pasó.
- El **último estado NO** se marca como `completed` (queda pendiente / no
  alcanzado), porque el flujo no llegó normalmente al final.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Sí  | No (revisar) | No |

## Diseño

### API (lógica de estado)
- Detectar el caso "ninguna admitida" en el orquestador
  (`job_orchestrator_service.py`, rama de items vacíos / cascada) y/o en
  `workflow_phase_service`.
- En ese caso:
  - Marcar la fase de **admisibilidad** con un estado/flag de advertencia (ver
    abajo) en vez de `completed`.
  - **No** marcar las fases posteriores (incluida la última) como `completed`;
    dejarlas `pending`/no alcanzadas. El análisis puede seguir cerrando en `ready`
    (o evaluar un estado terminal propio, ver Notas), pero sin pintar el final
    como completado.
- Representación del "amarillo": agregar un estado/sub-estado nuevo. Opciones:
  - Nuevo valor de status de fase `warning` (o `blocked`), o
  - Un flag `admissibility_blocked: true` en la fase de admisibilidad que la UI
    mapea a amarillo.
  Elegir uno y propagarlo por el schema de fases/steps que consume la UI.

### UI
- `WorkflowVisualization.tsx`: agregar config de color para el estado de
  advertencia → `amber` (ej. `bg-amber-100` / `border-amber-500` /
  `text-amber-700`), e icono de alerta (lucide `AlertTriangle`).
- Asegurar que la última fase NO se muestre como completada (azul) en este caso.

Archivos:
- `accsa-licitaciones-api/app/services/job_orchestrator_service.py`
- `accsa-licitaciones-api/app/services/workflow_phase_service.py`
- schema de fases/steps (agregar el estado/flag de advertencia)
- `accsa-licitaciones-ui/src/components/WorkflowVisualization.tsx`
- `accsa-licitaciones-ui/src/app/analyses/[id]/page.tsx` (si mapea status→props)

## Verificación

- Análisis donde ninguna propuesta pasa admisibilidad:
  - La fase de admisibilidad se ve en **amarillo** con icono de alerta.
  - La última fase NO aparece en azul/completada.
  - El análisis cierra sin error (no `failed`), reflejando "cortó por admisibilidad".
- Análisis donde al menos una pasa: comportamiento intacto (admisibilidad
  completa, flujo sigue).
- `pnpm build` + import API OK.

## Notas / a decidir en implementación

- ¿El análisis debe quedar en `ready` (como hoy) o conviene un estado terminal
  explícito tipo `rejected_all` para distinguir "terminó OK" de "cortó por
  admisibilidad"? El requerimiento solo pide el tratamiento visual; mantener
  `ready` + el amarillo de la fase es suficiente, pero anotarlo.

## Relación

- Mismo componente UI que el Feature 03 (HOTL ocultar nodos). **Implementarlos
  juntos** evita dos pasadas por `WorkflowVisualization.tsx`.

## Implementado (2026-06-20)

Corrección de premisa: el "estado" que ve el usuario son las **fases**
(`analysis_workflow_phases`) renderizadas por `WorkflowPhases.tsx`, no los steps
de `WorkflowVisualization.tsx`. Todo el feature se implementa a nivel de fase.

Representación del amarillo: **nuevo valor de enum** `warning` en
`workflow_phase_status` (migración MCP Supabase
`add_warning_to_workflow_phase_status`). El enum no tenía CHECK constraint; solo
el tipo enum + el `Literal` Pydantic.

- **DB**: `ALTER TYPE workflow_phase_status ADD VALUE 'warning'`.
- **API schema** (`schemas/workflow_phase.py`): `status` Literal incluye `warning`.
- **API** (`workflow_phase_service.py`): nuevo `apply_admissibility_cut(analysis_id)`:
  si `award_check` está `completed`, lo repinta a `warning` (progress 100) y deja
  `final_compliance_check` en `pending` (progress 0, sin `ended_at`). Guard:
  solo actúa si la admisibilidad realmente corrió (`award_check == completed`),
  evitando falsos warnings cuando el flujo ni llegó a admisibilidad.
- **API** (`job_orchestrator_service.py`): se llama `apply_admissibility_cut` en
  los dos finalizadores cuando no hay admitidas:
  - `_complete_downstream_and_finalize` (path HOTL / sin pausa).
  - `_maybe_finalize_pipeline` (path HITL: el resume cascada fan-outs vacíos),
    guardado por `not get_admitidas_by_analysis_id`.
  Los **steps** downstream se siguen autocompletando como antes (DAG/`/flow`
  intacto, sin riesgo con el monitor); solo cambia la representación de fases.
- **UI** (`WorkflowPhases.tsx`): `UiStatus` + `Phase.status` agregan `warning`;
  `normalizeStatus` lo prioriza (antes del check `progress >= 100`); `Step` lo
  pinta ámbar (`amber-500`/`amber-400`/`amber-600`) con icono `AlertTriangle` y
  label "Sin admisibles". La última fase queda en `pending` → progreso global
  < 100% (señal de "cortó por admisibilidad"). Análisis sigue en `ready` /
  `is_success=True` (no `failed`).
- `WorkflowVisualization.tsx` sin tocar (steps, sin estado warning).
- `py_compile` OK; `tsc --noEmit` OK; sin lint nuevos.
