# service-copy-indexs

## Propósito
Copia todos los vectores de una colección Qdrant por archivo (`FILE_{slug}_{file_id}`) a la colección principal del análisis (`{slug}`). Reutiliza embeddings ya generados por `service-qdrant-by-file`, sin re-descargar ni re-embeddear.

## Tareas que realiza

1. Obtiene el slug del análisis via API (nombre de la colección principal)
2. Verifica que la colección origen `FILE_{slug}_{file_id}` exista en Qdrant
3. Limpia puntos previos con `file_id=FILE_ID` de la colección principal (idempotencia)
4. Scroll de todos los puntos (con vectores y payload) desde la colección origen en lotes de 256
5. Upsert de los puntos en la colección principal en lotes de 100
6. Actualiza `total_chunks` del archivo via API
7. Registra eventos de progreso via API
8. Notifica finalización (éxito o fallo) via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- **FILE_ID** (runtime): UUID del archivo a copiar
- Lee: slug del análisis via API, puntos de colección `FILE_{slug}_{file_id}` en Qdrant

## Salida
- Puntos copiados en la colección principal `{slug}` de Qdrant
- `total_chunks` actualizado en el registro del archivo via `PATCH /api/v1/processed-files/{file_id}`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Scroll de colección origen + upsert en colección principal + limpieza de puntos previos |
| **Backend API** | Obtener slug del análisis, actualizar `total_chunks`, logging de eventos, callback |

## Notas
- No descarga archivos ni genera embeddings. Depende de que `service-qdrant-by-file` haya corrido antes.
- Idempotente: si se relanza, limpia los puntos previos del mismo `file_id` antes de copiar.
- Si la colección origen está vacía, registra warning y notifica éxito sin copiar nada.
