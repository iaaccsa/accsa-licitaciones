# service-proposal-scorer

## Propósito
Calcula el score de cumplimiento de cada propuesta y genera un resumen en markdown usando Gemini.

## Tareas que realiza

1. Obtiene propuestas con conteos de cumplimiento (desde proposals_view) via API
2. Por cada propuesta:
   - Calcula score: `compliant / (compliant + non_compliant + missing_info + unprocessable) * 100`
   - Obtiene resultados detallados de cumplimiento via API
   - Llama a Gemini para generar resumen de 2 párrafos en español:
     - Párrafo 1: nivel general de cumplimiento, fortalezas, códigos de requisitos
     - Párrafo 2: brechas críticas, recomendaciones accionables
   - Actualiza el registro de proposal con score y resumen via API
3. Log de resumen de scoring
4. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: propuestas desde `/proposals/search-with-counts`, resultados de cumplimiento por propuesta

## Salida
- Registros de proposal actualizados con:
  - `compliance_score`: porcentaje (0.00 – 100.00)
  - `compliance_summary`: texto markdown (2 párrafos, español)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Gemini** | Generación de resumen de cumplimiento |
| **Backend API** | Obtener propuestas con conteos, obtener resultados, actualizar score/resumen, callback |
