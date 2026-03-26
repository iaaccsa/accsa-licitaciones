# service-file-metadata-extractor

## Propósito
Extrae metadata estructurada de un archivo individual usando Gemini, basándose en los chunks almacenados en una colección Qdrant por archivo.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Construye el nombre de colección Qdrant por archivo: `FILE_{slug}_{file_id}`
3. Obtiene el registro del archivo via API
4. Lee todos los chunks desde la colección Qdrant del archivo
5. Concatena los chunks (hasta MAX_CHARS=10000)
6. Llama a Gemini para extraer metadata estructurada (JSON)
7. Actualiza el archivo con la metadata via API (PATCH)
8. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- **FILE_ID** (runtime): UUID del archivo a procesar
- Lee: chunks desde colección Qdrant `FILE_{slug}_{file_id}`

## Salida
- Actualiza el campo `metadata` del archivo con:
  - `document_type`: pliego, propuesta, normativa, otro
  - `company_name`: nombre de la empresa
  - `company_role`: licitante, oferente, regulador, otro
  - `document_purpose`: objetivo del documento
  - `key_identifiers`: tax_id, contract_number, representative_name
  - `summary`: resumen de 2-3 oraciones

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Lectura de chunks desde colección por archivo |
| **Gemini** | Extracción de metadata estructurada |
| **Backend API** | Obtener análisis, obtener archivo, actualizar metadata, callback |
