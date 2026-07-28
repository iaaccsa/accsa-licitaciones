# Feature 08 — Veredicto de admisibilidad binario (cumple / no_cumple)

## Implementado (2026-06-20)

Decisión de alcance (encuesta): **binario estricto**. La columna `verdict` resultó
ser el enum nativo **compartido** `compliance_verdict` (6 valores), y la realidad de
los datos no coincidía con el spec: 4789 filas `no_evidencia` (mayoría), 354
`cumple_parcial`, 224 `no_cumple`, 729 `cumple`. Se colapsa **todo lo no-cumple**
(incluido `no_evidencia` y `requiere_verificacion_manual`) → `no_cumple`. El flag
`manual_verification_required` se conserva para HITL.

- **DB** (migración `admissibility_results_binary_verdict`): `UPDATE ... SET
  verdict='no_cumple' WHERE verdict<>'cumple'` (5367 filas) + CHECK
  `admissibility_results_verdict_binary_check` (`verdict IN ('cumple','no_cumple')`),
  **solo** en `admissibility_results`. El enum compartido queda intacto.
- **API**: enum dedicado `AdmissibilityVerdict {cumple,no_cumple}` en
  `schemas/admissibility_result.py` (reemplaza al viejo `ComplianceVerdict` de 6
  valores en Create/Read/Patch); endpoint `admissibility_results.py` importa y filtra
  con el nuevo enum. Insert/PATCH no binario → 422.
- **Services** (`service-admissibility-matcher`): chokepoint defensivo en
  `append_admissibility_results` (`"cumple" if e.verdict=="cumple" else "no_cumple"`)
  cubre todas las fuentes (auto-filtros, LLM, degrade). Gate sin cambios (ya trataba
  `!=cumple` como rechazo).
- **UI**: `admissibility-types.ts` `ComplianceVerdict` = `"cumple"|"no_cumple"`;
  `AdmissibilityMatrix.tsx` `VERDICT_CONFIG` 2 valores (selector HITL + chips de filtro
  se reducen solos). `ComplianceMatrix.tsx` (matriz general) intacta.

Verificación: `py_compile` (API+matcher) OK; `tsc --noEmit` + `pnpm build` OK;
test negativo DB (insert `no_evidencia` → constraint 23514). **Pendiente: deploy**
(redeploy `service-admissibility-matcher` azure + API).

---


Cubre ToDo item **13** ("En base de datos, los requisitos de admisibilidad solo
pueden ser cumple/no cumple").

Complejidad: **media-alta** (migración DB + constraint + mapping en el matcher +
editor UI + migración de filas existentes; toca DB, services y UI).

---

## Estado actual

- El veredicto vive en `admissibility_results.verdict`. El enum
  `ComplianceVerdict` (`schemas/admissibility_result.py:8`) tiene **4 valores**:
  `cumple`, `cumple_parcial`, `no_cumple`, `no_aplica`.
- Lo escribe `service-admissibility-matcher` (clon recortado del compliance-matcher)
  con la salida del LLM (`prompt_compliance_evaluator.md`), que puede devolver
  cualquiera de los 4.
- El gate (`service-admissibility-gate`) decide admitida/rechazada: una obligatoria
  con `verdict != cumple` (o sin fila) rechaza (memoria `path2-reorder-status`).
- La UI lo muestra/edita en `AdmissibilityMatrix.tsx` (HITL: PATCH del verdict).

## Decisión cerrada (encuesta)

**Constraint DB + matcher + UI**:
- DB restringe `admissibility_results.verdict` a **2 valores** (`cumple`,
  `no_cumple`).
- El **matcher** mapea cualquier `cumple_parcial`/`no_aplica` → `no_cumple` antes
  de persistir.
- El **editor HITL** solo ofrece `cumple` / `no_cumple`.
- **Filas existentes** se migran (cumple_parcial/no_aplica → no_cumple).

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Sí  | Sí | Sí |

## Diseño

### DB (vía MCP Supabase)
- Migración: actualizar filas existentes con `verdict IN ('cumple_parcial','no_aplica')`
  → `'no_cumple'`. (Solo en `admissibility_results`, NO en la matriz general
  `analysis_compliance_matrix`, que mantiene los 4 valores.)
- Agregar `CHECK (verdict IN ('cumple','no_cumple'))` a `admissibility_results`
  (o, si el verdict es un enum nativo, usar un enum/constraint específico de
  admisibilidad — definir en implementación; lo más simple es un CHECK).
- Cuidado: que el constraint solo aplique a la tabla de admisibilidad, no a la
  general.

### API
- `schemas/admissibility_result.py`: el enum del veredicto de admisibilidad debe
  aceptar solo `cumple`/`no_cumple`. Si `ComplianceVerdict` es compartido con la
  matriz general, **crear un enum dedicado** `AdmissibilityVerdict {cumple,
  no_cumple}` para los schemas de admisibilidad (no romper la general).
- Validación: rechazar (422) un PATCH/insert con otro valor.

### Services
- `service-admissibility-matcher/main.py`: tras obtener el verdict del LLM,
  normalizar `cumple_parcial`/`no_aplica` → `no_cumple` antes de
  `append_admissibility_results`. (El prompt puede además ajustarse para pedir
  binario, pero el mapping defensivo es obligatorio.)
- Verificar que el **gate** sigue correcto: con binario, "obligatoria != cumple"
  ya es exactamente "no_cumple" → la lógica de rechazo no cambia.

### UI
- `AdmissibilityMatrix.tsx`: el selector de verdict en modo HITL muestra solo
  `cumple` / `no_cumple` (quitar `cumple_parcial`/`no_aplica` de las opciones para
  admisibilidad). La matriz general (`ComplianceMatrix.tsx`) queda **intacta**.

## Verificación

- Insert/PATCH de admisibilidad con `cumple_parcial` → 422 (API) y la DB rechaza.
- Matcher: una propuesta con respuesta LLM "parcial" persiste `no_cumple`.
- Filas viejas migradas (no queda ninguna con cumple_parcial/no_aplica en
  `admissibility_results`).
- Matriz general sigue aceptando los 4 valores.
- Editor HITL de admisibilidad solo ofrece 2 opciones.
- `pnpm build` + import API + `py_compile` del matcher OK.

## Deploy

- Requiere redeploy de `service-admissibility-matcher` (build-and-push azure) +
  API. Migración DB vía MCP antes del deploy.

## Relación

- Toca las mismas pantallas que el Feature 01 (badge excluyente). Pueden ir
  juntos si se quiere un solo pase por la UI de admisibilidad, aunque son
  independientes.
