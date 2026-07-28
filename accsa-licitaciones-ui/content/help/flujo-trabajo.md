---
id: flujo-trabajo
title: El flujo de trabajo (pipeline)
section: Análisis
order: 30
keywords: [flujo, pipeline, pasos, fases, progreso, workflow, etapas]
updated_at: 2026-06-25
---

Cuando inicia un análisis, el sistema ejecuta una **secuencia de pasos
automáticos** (el pipeline). En la pantalla del análisis se ve como un árbol de
fases que avanza solo. A grandes rasgos, el sistema:

1. **Extrae y convierte** los documentos PDF a texto.
2. **Indexa** el contenido para poder buscarlo y citarlo.
3. **Clasifica** cada documento (pliego o oferta) y **agrupa** las ofertas.
4. **Extrae los requisitos** del pliego y los **requisitos de admisibilidad**.
5. **Detecta el sistema de evaluación**.
6. **Compara cada oferta** contra los requisitos (matriz de cumplimiento).
7. Evalúa la **admisibilidad** de cada propuesta.
8. Genera un **resumen** por propuesta.

No tiene que hacer nada durante el proceso: los pasos en ejecución se muestran
animados y, al terminar, las secciones se llenan de resultados. Si el análisis usa
**validación humana**, el flujo se **pausa** en ciertos puntos y espera su
aprobación para seguir.

Si algo falla, el paso correspondiente queda marcado y el análisis pasa a estado
**Fallido**; los **eventos** del análisis ayudan a entender en qué punto ocurrió.
