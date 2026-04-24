# service-chunk-and-index

## Propósito
Descarga archivos markdown, los divide semánticamente en chunks, genera embeddings con OpenAI e indexa los chunks en la colección Qdrant del análisis.

## Tareas que realiza

1. Obtiene el slug del análisis (= nombre de colección Qdrant) via API
2. Consulta todos los archivos convertidos via API (POST /files/merged)
3. Por cada archivo:
   - Descarga el markdown desde Supabase Storage
   - Divide semánticamente (por headers markdown, luego splitter recursivo)
   - Genera embeddings OpenAI (text-embedding-3-small, procesamiento en batch)
   - Sube a Qdrant con payload completo:
     - text, file_id, analysis_id, category, label
     - proposal_id, proposal_provider_name, filename, headers
   - Actualiza el registro del archivo con `total_chunks`
4. Log de resumen de indexación
5. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: archivos markdown desde Supabase Storage (via `/files/merged`)

## Salida
- Puntos en Qdrant con vectores de 1536 dimensiones (text-embedding-3-small)
- Chunks de ~1000 caracteres con 200 de overlap
- Payload por punto: text, file_id, analysis_id, category, label, proposal_id, proposal_provider_name, filename, markdown headers
- Campo `total_chunks` actualizado por archivo

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Descarga de archivos markdown |
| **OpenAI** | Generación de embeddings (text-embedding-3-small) |
| **Qdrant** | Upsert de vectores y payloads |
| **Backend API** | Obtener análisis, buscar archivos, actualizar total_chunks, callback |
