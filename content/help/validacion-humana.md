---
id: validacion-humana
title: Validación humana (aprobaciones)
section: Análisis
order: 40
keywords: [validacion humana, hitl, aprobacion, pausa, continuar, revision, control]
updated_at: 2026-06-25
---

La **validación humana** (HITL) hace que el análisis se **pause** en puntos de
control para que una persona revise y apruebe antes de seguir. Sirve para corregir
la clasificación de archivos o los resultados antes de que el pipeline continúe.

Cuando un análisis está **Esperando aprobación**:

- En la cabecera aparece el botón **Continuar**.
- En los accesos a las secciones aparece un **punto rojo parpadeante** sobre la
  sección donde el análisis se detuvo (por ejemplo Archivos, Requisitos o
  Propuestas). Esa es la sección que conviene revisar.

Flujo típico: entre a la sección marcada, revise y ajuste lo necesario (mover o
excluir archivos, confirmar requisitos, corregir veredictos) y luego pulse
**Continuar** para que el pipeline retome desde ese punto.

Que un análisis use o no validación humana se decide por la **configuración
global** vigente al crearlo. Los administradores la activan o desactivan en
Configuración › Validación humana.
