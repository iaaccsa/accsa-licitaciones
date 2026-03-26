# service-requirement-extractor

## Propósito
Extrae requisitos del pliego de licitación desde los chunks de tender indexados en Qdrant, los consolida eliminando duplicados, y los almacena en la base de datos.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Lee de Qdrant todos los chunks donde `category='tender'`
3. Extrae requisitos iterativamente de cada chunk usando Gemini:
   - Identifica obligaciones, calificaciones, procedimientos, condiciones
   - Genera JSON con lista de requisitos (id, categoría, texto, obligatoriedad, chunk_id)
4. Consolida todos los requisitos usando Gemini:
   - Elimina duplicados
   - Fusiona requisitos divididos entre chunks
   - Asigna IDs: REQ-001, REQ-002, etc.
   - Máximo 50 palabras por requisito, en español
5. Guarda los requisitos via API (POST /requirements)
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: chunks de Qdrant donde `category='tender'`

## Salida
- Registros de requisitos:
  - analysis_id, requirement_code (REQ-XXX)
  - category (Technical, Administrative, Legal, Financial, Other)
  - requirement_text, is_mandatory
  - rag_chunk_id (referencia al chunk fuente)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Lectura de chunks de tender con filtros |
| **Gemini** | Extracción y consolidación de requisitos |
| **Backend API** | Obtener análisis, guardar requisitos, callback |
