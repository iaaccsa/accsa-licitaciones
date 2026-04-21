# service-tender-classifier

## Proposito
Clasifica el sistema de evaluacion del pliego licitatorio (ya indexado en Qdrant) en uno de 8 tipos, instancia los factores de puntuacion/penalizacion con sus pesos y formulas, y detecta las senales de roles activos. Produce un `evaluation_profile` (version 2) que usan los servicios downstream.

## Flujo

1. Obtiene `analysis_slug` via `GET /api/v1/analyses/{ANALYSIS_ID}`.
2. Ejecuta 10 queries semanticas en Qdrant sobre la coleccion del analisis para recuperar chunks relevantes (criterios de evaluacion, puntajes, penalizaciones, roles de habilitacion, etc.).
3. Llama al LLM (Gemini primary, OpenAI fallback) con los chunks como contexto para generar el `evaluation_profile`.
4. Calcula `enabled_roles` deterministicamente segun reglas del tipo de sistema clasificado.
5. Guarda el perfil via `POST /api/v1/tender-classifications/` (upsert).
6. Notifica finalizacion via callback.

## Tipos de sistema de evaluacion

| Tipo | Descripcion |
|------|-------------|
| `puntos` | Evaluacion por puntaje total; factores con peso numerico |
| `porcentajes` | Factores expresados como porcentaje del puntaje maximo |
| `mixto` | Combina puntaje y porcentaje en distintos factores |
| `solo_precio_con_AN` | Solo precio con Apertura de Negociacion |
| `solo_precio_exclusivo` | Solo precio, sin negociacion |
| `precio_con_incremento_multas` | Precio ajustado por multas/penalizaciones |
| `delegado_pliego_general` | Evaluacion delegada al pliego general de la licitacion |
| `indeterminado` | No es posible determinar el sistema con los documentos disponibles |

## Roles canonicos

| Rol | Descripcion |
|-----|-------------|
| `admisibilidad_obligatoria` | Requerimiento excluyente; incumplimiento descalifica la oferta |
| `admisibilidad_subsanable` | Requerimiento excluyente pero subsanable dentro del proceso |
| `puntuable` | Criterio que suma puntos o porcentaje a la evaluacion |
| `penalizador` | Criterio que resta puntos o aplica incremento de precio |
| `informativo` | Solo informativo; no afecta la evaluacion |
| `preferencia_legal` | Beneficio por ley (ej. industria nacional); se activa segun reglas del sistema |

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis
- Requiere: coleccion Qdrant del analisis con chunks de la licitacion indexados (categoria `tender`)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | 10 queries semanticas sobre chunks del pliego (evaluacion, puntajes, penalizaciones, habilitacion, etc.) |
| **Gemini** | Generacion del evaluation_profile (primary) |
| **OpenAI** | Fallback si Gemini falla |
| **Backend API** | Obtener analisis, guardar clasificacion, callback |
