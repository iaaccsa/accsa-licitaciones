---
id: tipos-evaluacion
title: Tipos de sistema de evaluación
section: Requisitos y admisibilidad
order: 40
keywords: [tipos, evaluacion, puntos, porcentajes, mixto, precio, antecedentes, multas, pliego general, formula, adjudicacion]
updated_at: 2026-07-09
---

La sección **Evaluación** muestra el tipo de sistema que el análisis detectó en
el pliego (ver [[evaluacion]]). Este es el catálogo de tipos que el sistema
reconoce y cómo funciona cada uno.

## Sistema de puntos

Las ofertas se evalúan asignando **puntos** a distintos factores (precio,
antecedentes, calidad, plazo, garantía, etc.) que suman un máximo, típicamente
100. Gana el mayor puntaje total. Es el sistema más completo y el más frecuente.

Fórmula típica: `Puntaje total = suma de factores - antecedentes negativos`

Tenga en cuenta:

- Los **antecedentes negativos** (RUPE o registros del organismo) se **restan**
  del total.
- En licitaciones de canon o concesión, el máximo puntaje puede ir al **mayor**
  precio, no al menor. Verifique siempre qué dice el pliego.

## Sistema de porcentajes

Igual idea que el de puntos, pero los factores se expresan como **porcentajes**
que suman 100%. Cada factor tiene su propio método de cálculo interno (regla de
tres, escalas por tramos, etc.).

Fórmula típica: `Puntaje = suma de (factor x peso %)`

Tenga en cuenta:

- Las **sanciones en RUPE** suelen funcionar aquí como factor **positivo**: se
  premia no tener sanciones, en lugar de descontar por tenerlas.

## Sistema mixto (cualitativo + cuantitativo)

La evaluación se divide en **dos bloques ponderados**: uno **cualitativo**
(típicamente 60%) con varios sub-factores técnicos y de antecedentes, y uno
**cuantitativo** (típicamente 40%) que evalúa solo el precio. Cada bloque se
puntúa sobre 100 y luego se multiplica por su peso.

Fórmula típica: `Puntaje final = (cualitativo x 0,6) + (cuantitativo x 0,4)`

Tenga en cuenta:

- Los antecedentes negativos se restan **dentro del bloque cualitativo**, no del
  puntaje final.
- Es habitual en compras de bienes de capital, donde la calidad técnica pesa
  tanto como el precio.

## Solo precio + antecedentes negativos (AN)

El único criterio de comparación es el **precio**, pero se aplica una fórmula de
**antecedentes negativos** (AN) que empeora la posición de las ofertas con
sanciones en RUPE. No hay puntuación multi-factor.

Fórmula típica: `Valor de comparación = puntaje de precio + AN` (gana el
**menor** valor)

Tenga en cuenta:

- Funciona **al revés** de un sistema de puntos: el valor 100 se asigna al
  precio **más alto** y se adjudica al **menor** valor total. Un puntaje alto
  aquí es malo.
- La fórmula del AN suele estar en un **anexo** separado, no en el cuerpo del
  pliego.

## Precio exclusivo (sin ponderación)

No hay puntajes, ponderaciones ni fórmulas: se adjudica directamente al **menor
precio** que cumpla todos los requisitos exigidos. Los requisitos técnicos
funcionan como filtro de admisibilidad (pasa / no pasa), no puntúan.

Tenga en cuenta:

- El valor del análisis está en los **requisitos de admisibilidad** y las
  condiciones del contrato, no en factores de puntaje.
- Aun así pueden aplicar regímenes de **preferencia legal** (PIN, MIPYMES).

## Precio + incremento por multas históricas

Gana el menor precio, pero el precio cotizado se **incrementa ficticiamente**
(solo a efectos comparativos) según el historial de **multas contractuales** del
oferente con el organismo en los últimos años.

Fórmula típica: `Precio comparativo = precio x (1 + multas / adjudicado)` cuando
la ratio supera el umbral del pliego

Tenga en cuenta:

- El incremento es **solo para comparar**: el contrato se firma al precio
  original cotizado.
- La **conducta comercial** puede ser además causal de rechazo directo, no un
  factor de puntaje.

## Delegado al pliego general

El pliego particular **no define criterios de evaluación propios**: remite al
**Pliego de Condiciones Generales** del organismo. Solo indica la base de
comparación (por ejemplo, total sin impuestos) y las condiciones técnicas.

Tenga en cuenta:

- La información del pliego particular es **incompleta**: sin el pliego general
  no se conocen los criterios reales de adjudicación.
- La **confianza** de la detección será baja o media, y los requisitos pueden
  quedar con rol *Pendiente de pliego general* (ver
  [[clasificacion-requisitos]]).
