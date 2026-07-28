# service-file-extractor

## Propósito
Descarga un archivo ZIP desde la URL del artefacto, extrae su contenido, sube cada archivo a Supabase Storage y crea los registros correspondientes en la base de datos.

## Tareas que realiza

1. Obtiene los datos del análisis (slug, artifact_path) via API
2. Actualiza el estado del análisis a "processing"
3. Descarga el ZIP desde `SUPABASE_ARTIFACTS_BASE_URL`
4. Extrae el contenido del ZIP en un workspace temporal
5. Sube cada archivo extraído a Supabase Storage (bucket `files`)
6. Crea un registro por archivo en la base de datos via API
7. Limpia archivos temporales
8. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis a procesar
- Lee: metadata del análisis, archivo ZIP desde URL externa

## Salida
- Archivos subidos a Supabase Storage en `files/{slug}/{file_id}{suffix}`
- Registros de archivo creados via `POST /api/v1/original-files/` (analysis_id, file_name, storage_path, category, file_size, mime_type)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Subida de archivos extraídos al bucket `files` |
| **Backend API** | Obtener análisis, crear registros de archivos, actualizar estado, callback |
| **HTTP externo** | Descarga del ZIP desde SUPABASE_ARTIFACTS_BASE_URL |
