# service-documents-classifier

## Propósito
Clasifica un archivo individual en una categoría (`tender`, `proposal`, `normative`, `unclassified`) usando Google Gemini basándose en la metadata previamente extraída del archivo.

## Tareas que realiza

1. Obtiene el registro del archivo via API (`GET /api/v1/files/{file_id}`)
2. **Clasificación**: Si el archivo tiene metadata:
   - Llama a Gemini para clasificarlo como `tender`, `proposal`, `normative` o `unclassified`
   - Regla: solo se clasifica como `proposal` si `company_name` está claramente identificado; de lo contrario, `unclassified`
   - Actualiza la categoría del archivo via API
   - Propaga la categoría al archivo original vinculado (campo `link`)
3. Si el archivo no tiene metadata, se marca como `unclassified`
4. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- **FILE_ID** (runtime): UUID del archivo a clasificar
- Lee: registro del archivo con campo `metadata` poblado

## Salida
- Archivo actualizado con `category` (tender/proposal/normative/unclassified)
- Archivo vinculado (link) actualizado con la misma categoría

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Gemini** | Clasificación del archivo basada en metadata |
| **OpenAI** | Fallback cuando Gemini falla |
| **Backend API** | Obtener archivo, actualizar categoría, callback |
