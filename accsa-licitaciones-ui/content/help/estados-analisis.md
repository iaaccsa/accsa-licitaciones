---
id: estados-analisis
title: Estados de un análisis
section: Análisis
order: 10
keywords: [estado, pendiente, procesando, completado, fallido, cancelado, esperando aprobacion]
updated_at: 2026-06-25
---

Cada análisis muestra un **estado** (una etiqueta de color en la cabecera):

- **Pendiente**: creado, aún no empezó a procesar.
- **Procesando**: el pipeline está trabajando. La pantalla se actualiza sola cada
  pocos segundos.
- **Esperando aprobación**: el análisis se pausó en un punto de control para que
  una persona revise antes de continuar. Aparece cuando el análisis usa
  **validación humana**. Se reanuda con el botón **Continuar**.
- **Completado**: terminó con éxito. Ya puede revisar requisitos, propuestas y
  cumplimiento.
- **Fallido**: terminó con error. Revise los eventos del análisis para ver qué
  pasó.
- **Cancelado**: alguien detuvo el análisis antes de terminar.

En la lista de análisis, los estados Pendiente, Procesando y Esperando aprobación
se agrupan en **En curso**; Completado y Fallido en **Completados**.
