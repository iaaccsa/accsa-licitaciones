# service-documents-grouper

## Propósito
Agrupa los archivos ya clasificados de un análisis: crea registros de proposals agrupados por empresa, genera el nombre del análisis, y crea el registro de tender vinculando los archivos correspondientes.

## Tareas que realiza

1. Obtiene todos los archivos del análisis via API (`POST /api/v1/files/search`)
2. **Agrupación de proposals**: Filtra archivos `proposal` con metadata:
   - Envía solo la metadata a Gemini para agrupar por empresa/dominio
   - Agrupa por company_name, tax_id, representative_name
   - Genera un label descriptivo por grupo
3. **Creación de proposals**: Por cada grupo:
   - Crea un registro de proposal via API (label, provider_name)
   - Actualiza `proposal_id` en cada archivo del grupo
   - Propaga `proposal_id` a archivos vinculados
4. **Generación de info del tender**: Filtra archivos tender (`is_processed_version=true`):
   - Envía solo la metadata a Gemini para generar un nombre (5-15 palabras) y la entidad contratante
   - Actualiza `generated_name` en el análisis via API
5. **Creación de tender**: Crea UN registro de tender por análisis (label, provider_name):
   - Actualiza `tender_id` en todos los archivos `tender` y `normative`
   - Propaga `tender_id` a archivos vinculados
   - Los archivos `unclassified` no se vinculan a ningún tender
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: todos los archivos ya clasificados con `category` y `metadata` poblados

## Salida
- Archivos `proposal` actualizados con `proposal_id`
- Archivos `tender` y `normative` actualizados con `tender_id`
- Registros de proposal creados (analysis_id, label, provider_name)
- Un registro de tender creado (analysis_id, label, provider_name)
- Análisis actualizado con `generated_name`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Gemini** | Agrupación de proposals, generación de nombre y entidad contratante |
| **OpenAI** | Fallback cuando Gemini falla |
| **Backend API** | Buscar archivos, actualizar archivos, crear proposals, crear tender, actualizar análisis, callback |
