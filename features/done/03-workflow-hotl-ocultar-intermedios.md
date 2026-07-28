# Feature 03 — HOTL: ocultar estados/nodos intermedios de aprobación

Cubre ToDo item **15** ("Cuando HOTL: Eliminar los estados intermedios").

Complejidad: **baja-media** (UI del workflow; posible filtro en datos de fases).

---

## Estado actual

- `workflow_phase_service.initialize_phases(analysis_id, hitl)`
  (`accsa-licitaciones-api/app/services/workflow_phase_service.py:23`) crea las
  fases del análisis. Para fases de `type == "approval"`, cuando `hitl == False`
  usa una etiqueta de "auto-aprobación" (`_auto_approval_label`), pero **la fase
  igual se crea y se muestra**.
- La visualización es `accsa-licitaciones-ui/src/components/WorkflowVisualization.tsx`
  (árbol por `{ code, parent_code, status }`). Renderiza todos los nodos que
  recibe.
- En modo HOTL (sin validación humana) las fases/nodos de pausa/aprobación no
  aportan: no hay intervención humana, son ruido visual.

## Decisión cerrada (encuesta)

**Ocultar los nodos de pausa/aprobación** cuando el análisis es HOTL (sin
validación humana). Esos nodos solo aplican a HITL.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Posible | No | No |

## Diseño

Dos enfoques posibles (elegir en implementación, preferencia por el de UI si los
datos lo permiten):

1. **Filtro en UI (preferido)**: `WorkflowVisualization.tsx` recibe el flag
   `hitl` del análisis (o el `type`/marca de cada nodo). Si `hitl === false`,
   filtra los nodos de tipo aprobación/pausa antes de construir el árbol, y
   reconecta los hijos al padre del nodo removido para no romper la jerarquía.
   - Requiere que cada nodo traiga su `type` (o un flag `is_approval`). Verificar
     qué expone el endpoint de fases/steps que consume la página
     `analyses/[id]/page.tsx`. Si no lo expone, exponerlo (cambio menor en el
     schema de respuesta).

2. **No crear las fases de aprobación en HOTL (API)**: en
   `initialize_phases`, cuando `hitl == False`, **omitir** las fases
   `type == "approval"` en vez de renombrarlas. Más limpio en datos, pero cambia
   el set de fases persistidas (revisar que `update_phase_progress` y el
   orquestador no dependan de que esas fases existan).

Recomendación: empezar por (1) (UI, reversible, no toca pipeline). Pasar a (2)
solo si se quiere que las fases ni siquiera se persistan.

Archivos:
- `accsa-licitaciones-ui/src/components/WorkflowVisualization.tsx`
- `accsa-licitaciones-ui/src/app/analyses/[id]/page.tsx` (pasar `hitl` / type)
- (si hace falta exponer el type) schema de fases/steps en API.

## Verificación

- Análisis HOTL: la visualización no muestra nodos de pausa/aprobación; el árbol
  queda conexo (sin huecos).
- Análisis HITL: se siguen viendo las pausas/aprobaciones igual que hoy.
- `pnpm build` OK.

## Relación

- Mismo componente que el Feature 04 (corte por admisibilidad). **Conviene
  implementarlos juntos** (un solo pase por `WorkflowVisualization.tsx`).

## Implementado (2026-06-20)

Corrección de premisa: el componente vivo en `/analyses/[id]` es
**`WorkflowPhases.tsx`** (consume `/api/analyses/[id]/phases`), no
`WorkflowVisualization.tsx` (ese solo se usa en el sub-page admin `/flow`,
y renderiza *steps* sin nodos de aprobación). Por tanto el cambio va en
`WorkflowPhases.tsx`.

- En `WorkflowPhases.tsx`, las fases `type === "approval"` se pintan como el
  badge del `Connector` entre círculos. En HOTL ese badge ya se detectaba como
  auto (`isAuto`, label de la fase empieza con "Sin aprobación").
- Cambio: cuando `isAuto`, **no se renderiza el badge** del `Connector` (se deja
  solo la línea conectora). Resultado: en HOTL desaparecen los estados
  intermedios de aprobación; en HITL siguen igual.
- UI-only, sin cambios de API/DB. `WorkflowVisualization.tsx` sin tocar.
- `tsc --noEmit` OK; sin lint nuevos.
