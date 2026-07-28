# service-qdrant-by-file

## Propósito
Crea una colección Qdrant dedicada por archivo e indexa un solo archivo markdown en ella. Usado como prerequisito por service-file-metadata-extractor.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Construye nombre de colección: `FILE_{slug}_{file_id}`
3. Obtiene el registro del archivo via API
4. Crea o verifica la colección Qdrant (1536 dims, COSINE)
5. Descarga el archivo markdown desde Supabase Storage
6. Divide semánticamente (por headers, luego splitter recursivo)
7. Genera embeddings OpenAI (text-embedding-3-small)
8. Sube chunks a la colección Qdrant del archivo
9. Actualiza el registro del archivo con `total_chunks`
10. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- **FILE_ID** (runtime): UUID del archivo a indexar
- Lee: archivo markdown desde Supabase Storage

## Salida
- Colección Qdrant: `FILE_{slug}_{file_id}` con vectores de 1536 dimensiones
- Puntos con metadata: text, file_id, analysis_id, category, label, proposal_id, filename
- Campo `total_chunks` actualizado en el registro del archivo

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Descarga del archivo markdown |
| **OpenAI** | Generación de embeddings (text-embedding-3-small) |
| **Qdrant** | Creación de colección, upsert de vectores |
| **Backend API** | Obtener análisis, obtener archivo, actualizar total_chunks, callback |
