# service-metadata-extractor

## Propósito
Extrae metadata de las propuestas (nombre de empresa, contacto, identificadores fiscales) desde chunks indexados en Qdrant y actualiza los registros de proposals.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Lee de Qdrant todos los chunks donde `category='proposal'`
3. Agrupa chunks por `proposal_id`
4. Por cada propuesta:
   - Concatena chunks (hasta MAX_CHARS_PER_PROPOSAL=8000)
   - Llama a Gemini para extraer metadata (JSON estructurado)
   - Actualiza el registro de proposal en Supabase (directamente, no via API REST)
5. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: chunks de Qdrant donde `category='proposal'`, agrupados por proposal_id

## Salida
- Registros de proposal actualizados con:
  - `provider_name`: nombre de la empresa
  - `provider_metadata`: JSON con email, address, phone, tax_id, representative_name, additional

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Lectura de chunks de propuesta, agrupados por proposal_id |
| **Gemini** | Extracción de metadata estructurada |
| **Supabase** | Actualización directa de tabla proposals (no via API REST) |
| **Backend API** | Obtener análisis, callback |

> **Nota:** Este servicio actualiza proposals directamente via Supabase client en lugar de usar la API REST del backend.
