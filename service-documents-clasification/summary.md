# service-documents-clasification

## Propósito
Clasifica archivos en categorías (`tender`, `proposal`, `normative`, `unclassified`), agrupa los archivos de propuesta por empresa, crea registros de proposals y un tender por análisis, y genera un nombre descriptivo para el análisis.

## Tareas que realiza

1. Obtiene todos los archivos del análisis via API
2. **Clasificación**: Por cada archivo con metadata:
   - Llama a Gemini para clasificarlo como `tender`, `proposal`, `normative` o `unclassified`
   - Regla: solo se clasifica como `proposal` si `company_name` está claramente identificado; de lo contrario → `unclassified`
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
5. **Generación de info del tender**: Filtra archivos tender (`is_processed_version=true`):
   - Envía solo la metadata a Gemini para generar un nombre (5-15 palabras) y la entidad contratante
   - Actualiza `generated_name` en el análisis via API
6. **Creación de tender**: Crea UN registro de tender por análisis (label, provider_name):
   - Actualiza `tender_id` en todos los archivos `tender` y `normative`
   - Propaga `tender_id` a archivos vinculados
   - Los archivos `unclassified` no se vinculan a ningún tender
7. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: todos los archivos con campo `metadata` poblado

## Salida
- Archivos actualizados con `category` (tender/proposal/normative/unclassified)
- Archivos `proposal` actualizados con `proposal_id`
- Archivos `tender` y `normative` actualizados con `tender_id`
- Registros de proposal creados (analysis_id, label, provider_name)
- Un registro de tender creado (analysis_id, label, provider_name)
- Análisis actualizado con `generated_name`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Gemini** | Clasificación de archivos, agrupación de proposals, generación de nombre y entidad contratante |
| **Backend API** | Buscar archivos, actualizar archivos, crear proposals, crear tender, actualizar análisis, callback |
