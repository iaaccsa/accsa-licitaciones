# service-documents-clasification

## Propósito
Clasifica archivos en categorías (tender, proposal, normative), agrupa los archivos de propuesta por empresa, crea registros de proposals, y genera un nombre descriptivo para el análisis.

## Tareas que realiza

1. Obtiene todos los archivos del análisis via API
2. **Clasificación**: Por cada archivo con metadata:
   - Llama a Gemini para clasificarlo como `tender`, `proposal` o `normative`
   - Actualiza la categoría del archivo via API
   - Propaga la categoría al archivo original vinculado (campo `link`)
3. **Agrupación de proposals**: Filtra archivos `proposal` con metadata:
   - Envía solo la metadata a Gemini para agrupar por empresa/dominio
   - Agrupa por company_name, tax_id, representative_name
   - Genera un label descriptivo por grupo
4. **Creación de proposals**: Por cada grupo:
   - Crea un registro de proposal via API (label, provider_name)
   - Actualiza `proposal_id` en cada archivo del grupo
   - Propaga `proposal_id` a archivos vinculados
5. **Generación de nombre**: Filtra archivos tender (`is_processed_version=true`):
   - Envía solo la metadata a Gemini para generar un nombre de 5-15 palabras
   - Actualiza `generated_name` en el análisis via API
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: todos los archivos con campo `metadata` poblado

## Salida
- Archivos actualizados con `category` (tender/proposal/normative)
- Archivos proposal actualizados con `proposal_id`
- Registros de proposal creados (analysis_id, label, provider_name)
- Análisis actualizado con `generated_name`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Gemini** | Clasificación de archivos, agrupación de proposals, generación de nombre |
| **Backend API** | Buscar archivos, actualizar archivos, crear proposals, actualizar análisis, callback |
