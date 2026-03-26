# service-verify-compliance

## Propósito
Verifica el cumplimiento de cada propuesta contra los requisitos extraídos, usando búsqueda vectorial, reranking semántico y verificación con Gemini.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Obtiene todas las propuestas via API
3. Obtiene todos los requisitos via API
4. Por cada propuesta, por cada requisito:
   - Genera embedding OpenAI del texto del requisito
   - Busca en Qdrant chunks de la propuesta (filtro: proposal_id, category='proposal')
   - Reordena los resultados con Cohere (rerank-multilingual-v3.0)
   - Si hay evidencia: llama a Gemini para verificar cumplimiento (JSON)
   - Si no hay evidencia: retorna status `missing_info`
   - Status posibles: compliant, non_compliant, missing_info, unprocessable
   - Genera: evidence_quote, reasoning (español), suggestion
5. Guarda resultados de cumplimiento via API (PUT batch)
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: propuestas, requisitos, chunks de propuesta desde Qdrant

## Salida
- Resultados de cumplimiento por par propuesta-requisito:
  - proposal_id, requirement_id, status
  - evidence_quote (cita textual de la propuesta)
  - reasoning (explicación en español)
  - suggestion (recomendación accionable)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **OpenAI** | Embeddings de requisitos (text-embedding-3-small) |
| **Qdrant** | Búsqueda vectorial de evidencia en chunks de propuesta |
| **Cohere** | Reranking semántico (rerank-multilingual-v3.0) |
| **Gemini** | Verificación de cumplimiento |
| **Backend API** | Obtener análisis, propuestas, requisitos, guardar resultados, callback |
