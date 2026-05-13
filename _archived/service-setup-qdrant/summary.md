# service-setup-qdrant

## Propósito
Crea o recrea la colección Qdrant para un análisis, configurando los índices necesarios para filtrado eficiente.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Conecta a Qdrant
3. Elimina la colección existente si la hay
4. Crea nueva colección (1536 dimensiones, distancia COSINE)
5. Crea índices de payload:
   - `analysis_id` (KEYWORD)
   - `file_id` (KEYWORD)
   - `category` (KEYWORD) — filtrar tender vs proposal
   - `proposal_id` (KEYWORD)
   - `label` (KEYWORD)
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: slug del análisis desde la API

## Salida
- Colección Qdrant nombrada con el slug del análisis
- Índices configurados para filtrado rápido

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Qdrant** | Creación/eliminación de colecciones, creación de índices |
| **Backend API** | Obtener análisis, callback |
