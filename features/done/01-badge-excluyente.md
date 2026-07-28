# Feature 01 — Badge "Excluyente" en requisitos de admisibilidad

Cubre ToDo item **14** ("Visual: Requisitos de admisibilidad (excluyentes)").

Complejidad: **baja** (solo UI).

---

## Estado actual

Los requisitos de admisibilidad viven en `admissibility_requirements` y se
muestran en la UI:
- `accsa-licitaciones-ui/src/app/analyses/[id]/admissibility/page.tsx` (lista de
  requisitos de admisibilidad).
- `accsa-licitaciones-ui/src/components/AdmissibilityMatrix.tsx` (matriz por
  propuesta).

Cada requisito tiene `roles: string[]`. Los roles válidos incluyen
`admisibilidad_obligatoria` (excluyente: su incumplimiento rechaza) y
`admisibilidad_subsanable` (no bloquea). Solo los **obligatorios** son
verdaderamente excluyentes (ver lógica del gate en memoria `path2-reorder-status`:
"solo obligatorias bloquean").

Hoy no hay una etiqueta visual que comunique al usuario que un requisito es
excluyente.

## Decisión cerrada (encuesta)

**Badge "Excluyente"**: mostrar una etiqueta/badge `Excluyente` en cada requisito
de admisibilidad **obligatoria** en la UI. Cambio **solo visual**, sin tocar
datos ni lógica. (No se agrupa en sección separada ni se renombra terminología.)

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | No  | No       | No |

## Diseño

- En `admissibility/page.tsx` y `AdmissibilityMatrix.tsx`, por cada requisito,
  si `roles.includes("admisibilidad_obligatoria")` → renderizar un badge
  `Excluyente` (componente `Badge` shadcn ya usado en el repo; color de
  advertencia, ej. `amber`/`red` suave, consistente con la paleta zinc).
- Tooltip opcional: "El incumplimiento de este requisito rechaza la propuesta".
- Definir helper local `isExclusionary(roles)` para no repetir el check.

Archivos:
- `accsa-licitaciones-ui/src/app/analyses/[id]/admissibility/page.tsx`
- `accsa-licitaciones-ui/src/components/AdmissibilityMatrix.tsx`
- (posible) `accsa-licitaciones-ui/src/lib/admissibility-types.ts` para el helper.

## Verificación

- Un requisito con rol `admisibilidad_obligatoria` muestra el badge `Excluyente`.
- Un requisito solo `admisibilidad_subsanable` NO lo muestra.
- `tsc --noEmit` + `pnpm build` limpios.

## Notas

- Si más adelante se quiere el agrupamiento en sección separada o el cambio de
  terminología, queda fuera de este feature (el usuario eligió solo el badge).
