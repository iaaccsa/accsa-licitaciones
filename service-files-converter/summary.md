# service-files-converter

## Propósito
Convierte archivos PDF/documentos a Markdown usando LlamaParse, sube los archivos convertidos a Supabase Storage y registra la relación con el archivo original.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Consulta todos los archivos no convertidos (`is_processed_version=false`) via API
3. Por cada archivo:
   - Descarga el original desde Supabase Storage
   - Lo sube a LlamaCloud y lo parsea con OCR (español habilitado)
   - Combina las páginas parseadas en un solo markdown
   - Sube el markdown a Supabase Storage
   - Crea un registro de archivo con `link` al archivo original
   - Limpia archivos temporales
4. Log de resumen de conversión
5. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: archivos originales desde Supabase Storage

## Salida
- Archivos markdown subidos a Supabase Storage: `{slug}/{file_id}.md`
- Registros de archivo con `is_processed_version=true`, `link={source_file_id}`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Descarga de originales, subida de markdown |
| **LlamaParse (LlamaCloud)** | Parsing de documentos con OCR agentic tier |
| **Backend API** | Obtener análisis, buscar archivos, crear registros, callback |
