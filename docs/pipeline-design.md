# Pipeline de evaluación de licitaciones (documento de diseño)

> **Documento histórico, desactualizado.** Origen: página `/docs/pipeline` de la UI, retirada el 2026-07-09.
> Describe una iteración anterior del pipeline: `service-queue`, `service-setup-qdrant`, `service-joiner` y `service-chunk-and-index` ya no existen (reemplazados por la arquitectura por archivo `qdrant-by-file` / `build-proposal-index`), y `service-admissibility-gate` junto con la extracción de oferta económica, listados aquí como "propuestos", ya están implementados.
> Para el estado actual ver `architecture.md` y el `CLAUDE.md` raíz del monorepo. Se conserva porque las partes 2-6 documentan el razonamiento de diseño y las etapas aún no construidas (scoring engine, acta de evaluación, verificaciones externas).

Estado del pipeline según el `pipeline_config.json` de aquel momento, y etapas complementarias propuestas para llegar de punta a punta a una recomendación de adjudicación documentada.

## Parte 1 - Etapas implementadas (en aquel momento)

### Bloque A - Ingesta y preparación documental

1. `service-queue` (En Espera): estado inicial, nodo raíz del grafo. No ejecuta lógica.
2. `service-file-extractor` (Extracción de Archivos): desempaqueta y descarga los archivos del pliego, normativas y propuestas.
3. `service-files-converter-mistral` (Preparación de Documentos): convierte archivos crudos a markdown estructurado con Mistral OCR.
4. `service-qdrant-by-file` (Indexación de Documentos, fan-out por archivo): indexa cada archivo individualmente en Qdrant.
5. `service-file-metadata-extractor` (Extracción de Metadatos, fan-out por archivo): título, tipo candidato, fechas, páginas.
6. `service-setup-qdrant` (Configuración RAG): configura la colección Qdrant del análisis con el esquema de payload esperado.

### Bloque B - Clasificación y consolidación documental

7. `service-documents-classifier` (fan-out por archivo + metadatos): clasifica cada archivo según su rol en el expediente.
8. `service-documents-grouper` (pause_after, HITL): agrupa archivos en conjuntos lógicos (pliego único, propuestas). Gate crítico: una agrupación mal hecha contamina todo lo posterior.
9. `service-joiner` (Uniendo Documentos): consolida cada grupo en un único markdown. En la consolidación se pierde trazabilidad por archivo fuente, compensada con citas (`chunk_id` + `snippet`).
10. `service-chunk-and-index` (fan-out por markdown unificado): chunkea con markdown-header-splitter, embeddings `text-embedding-3-small`, payload: `analysis_id`, `category` (pliego | proposal), `proposal_id`, `chunk_index`, `text`, `Header 1`. Fuente de verdad RAG.

### Bloque C - Análisis del pliego

11. `service-tender-classifier` (Determinación Sistema de Evaluación): detecta el `evaluation_profile`. Estrategias: `puntos`, `porcentajes`, `mixto_cualitativo_cuantitativo`, `solo_precio_con_AN`, `solo_precio_exclusivo`, `precio_con_incremento_multas`, `delegado_pliego_general`, `indeterminado`. Persiste en `tender_classifications` con `profile_version = 2`.
12. `service-requirement-extractor` (pause_after, HITL): extrae requisitos atómicos y los clasifica por el esquema multi-eje (Eje 1 rol, 2 factor, 3 dominio, 4 peso, 6 verificación, 7 obligatoriedad temporal; Eje 5 diferido). Persiste en `analysis_requirements` con códigos `REQ-001`, etc.

### Bloque D - Evaluación de propuestas

13. `service-compliance-matcher` (pause_after HITL, fan-out por propuesta): por cada requisito y propuesta decide veredicto via RAG + LLM: `cumple`, `cumple_parcial`, `no_cumple`, `no_evidencia`, `no_aplica`, `requiere_verificacion_manual`. Escribe `analysis_compliance_matrix`.
14. `service-compliance-summarizer` (fan-out por propuesta, is_final): computa métricas deterministas (`compliance_rate`, `compliance_counts`, `critical_failures_count`) y genera el texto narrativo de `compliance_summary`. Era el nodo final: la decisión de adjudicación quedaba fuera del sistema.

## Parte 2 - Etapas propuestas

Lo que falta para llegar de "propuestas con matriz y resumen" a "recomendación de adjudicación documentada y auditable".

### 15. `service-economic-offer-extractor` (propuesto, fan-out por propuesta, crítico)

RAG focalizado sobre la sección de oferta económica + LLM con output estructurado para extraer: monto total (valor, moneda, IVA), desglose por ítem, forma de pago, validez de la oferta, ajustes paramétricos, descuentos condicionales, preferencia nacional / MYPE. Sin este paso no se puede comparar por precio ni alimentar la fórmula del pliego.

- Persistencia: nueva tabla `proposal_economic_offers` con campos estructurados + `raw_extraction jsonb`.
- Ubicación: en paralelo al compliance-matcher, o en serie después del summarizer (Variante A, más simple).

### 16. `service-admissibility-gate` (propuesto, fan-out por propuesta)

Aplica reglas de admisibilidad formal para decidir si la propuesta es legalmente evaluable:

1. `critical_failures_count > 0` -> rechazada.
2. Faltan campos obligatorios de la oferta económica -> rechazada.
3. Condiciones habilitantes no verificables -> condicionada.
4. En cualquier otro caso -> admitida.

- Persistencia: columnas nuevas en `proposals`: `admissibility_status` enum, `admissibility_reasons jsonb`, `admissibility_evaluated_at`.
- Ubicación: después del summarizer y del economic-offer-extractor (necesita ambos); punto de join de las dos ramas.

### 17. `service-scoring-engine` (propuesto, sin fan-out)

Aplica la fórmula del pliego sobre las propuestas admitidas, despachando por estrategia: suma ponderada (puntos/porcentajes), mixto, ordenamiento por precio con o sin AN y preferencias, precio corregido por multas, `delegado_pliego_general` -> "no evaluable automáticamente", `indeterminado` -> falla suave con razonamiento.

- Salida: nueva tabla `proposal_scores` con puntaje total, desglose por factor, justificación, ranking y flags de desempate.
- Corre una sola vez por análisis con vista global (ranking comparativo, normalización de precios).
- Ubicación: después del admissibility-gate.

### 18. `service-evaluation-report` (propuesto, is_final)

Genera el deliverable final: acta de evaluación en `.docx`/PDF con la estructura típica uruguaya: identificación del llamado, propuestas recibidas, admisibilidad, evaluación técnica, evaluación económica, aplicación de la fórmula, ranking con desempates, recomendación al ordenador del gasto, anexos.

- Implementación: plantilla + datos (narrativa ya disponible en `compliance_summary`). Un acta por análisis.
- Persistencia: tabla `analysis_reports` (storage path, versión, generated_at) y endpoint de descarga.

### 19. `service-external-verifications` (opcional, fan-out por propuesta)

Reemplaza parte del HITL consultando fuentes externas para requisitos `requiere_verificacion_manual` o con `verification_method = certificado_externo`. Integraciones candidatas: RUPE, BPS, DGI, BSE. Opcional porque depende de integraciones disponibles y con SLA aceptable; sin esto el pipeline sigue con HITL. Ubicación: entre compliance-matcher y admissibility-gate.

### 20. `service-pipeline-observability` (opcional)

No es un nodo del pipeline: tabla + vistas + dashboard con timeline de ejecución, costos LLM por etapa, conteos de éxito/falla/reintentos, estado actual y métricas de calidad. Los servicios ya usan `log_event` / `supabase_logger`, suficiente para debugging; esto es nice-to-have hasta que haya carga real.

## Parte 3 - Grafo propuesto

### Variante A - secuencial (mínimo esfuerzo, sin cambios al orquestador)

```
... -> compliance-matcher -> compliance-summarizer -> economic-offer-extractor -> admissibility-gate -> scoring-engine -> evaluation-report
       (fan_out: proposal)   (fan_out: proposal)      (fan_out: proposal)         (fan_out: proposal)   (sin fan_out)     (sin fan_out)
       (HITL pause)
```

El economic-offer-extractor corre después del summarizer. No es el orden más eficiente, pero respeta un grafo lineal simple.

### Variante B - con ramas paralelas (más eficiente, requiere join en el orquestador)

```
                                    +-- compliance-matcher -> compliance-summarizer --+
                                    |      (HITL pause)                               |
requirement-extractor (HITL) ------>|                                                 +--> admissibility-gate -> scoring-engine -> evaluation-report
                                    |                                                 |
                                    +-- economic-offer-extractor ---------------------+
                                           (fan_out: proposal)
```

Ambas ramas son fan-out por propuesta. El admissibility-gate requiere barrier/join por `proposal_id`.

Recomendación de entonces: arrancar con la Variante A y migrar a la B cuando la performance lo justifique.

## Parte 4 - Orden de implementación sugerido

1. `service-economic-offer-extractor`: input obligatorio de las dos etapas siguientes.
2. `service-admissibility-gate`: filtro que determina qué entra al scoring; reglas deterministas sin LLM.
3. `service-scoring-engine`: la etapa con más lógica; empezar soportando una sola estrategia y agregar las demás después.
4. `service-evaluation-report`: una vez que scoring funciona, es mayormente plumbing + plantilla.

Con esos cuatro, el pipeline termina en un `.docx` firmable. Las etapas 19 y 20 se agregan después.

## Parte 5 - Dependencias de schema y API

- `economic-offer-extractor`: tabla `proposal_economic_offers`; endpoints POST/GET/PATCH siguiendo el patrón del matcher.
- `admissibility-gate`: columnas en `proposals` (`admissibility_status`, `admissibility_reasons`, `admissibility_evaluated_at`); endpoint `PATCH /api/v1/proposals/{id}/admissibility-result`.
- `scoring-engine`: tabla `proposal_scores`; campo `analyses.ranking`; endpoints de puntajes y ranking.
- `evaluation-report`: tabla `analysis_reports` (storage path, versión, generated_at); endpoint de descarga; integración con storage.

## Parte 6 - Cosas diferidas que se cruzan con las etapas nuevas

Revisar las entradas del `pending.md` al implementar:

- Entrada 1 (Eje 5, fuente del documento): no bloqueante, pero el acta se beneficia de citar "según el pliego particular" vs "según la normativa externa".
- Entradas 2 y 3 (re-ejecución del matcher/extractor preservando HITL): importante si se habilita re-ejecución del scoring con cambios de pliego a mitad de proceso.
- Entrada 4 (re-ejecución voluntaria del summarizer): relevante solo si el scoring-engine también debe soportar re-ejecución voluntaria para probar cambios de fórmula.
