# LLM Model Mapping

> **Histórico.** Asignación fija de modelos por servicio, superada por la configuración global de LLM (proveedor + nivel de inteligencia resueltos via la tabla `model_tiers`; ver `model-tiers.md`). Actualizado por última vez con el contenido de la página `/docs/llm-models` de la UI, retirada el 2026-07-09.

Modelos asignados por servicio segun complejidad de la tarea. El embedding model (`text-embedding-3-small` de OpenAI) se mantiene sin cambios en los servicios que lo usan.

| Servicio | Tarea LLM | Complejidad | Primary | Fallback | Justificacion |
|---|---|---|---|---|---|
| service-documents-classifier | Clasificar tipo de documento (pliego, anexo, adenda, etc.) | Baja | gemini-2.5-flash | gpt-4.1-mini | Clasificacion con categorias fijas y contexto corto. No requiere razonamiento complejo |
| service-documents-grouper | Agrupar documentos por similitud de contenido | Baja | gpt-4.1-mini | gemini-3.1-pro-preview | Agrupacion y generacion de nombre de licitacion. OpenAI como primario; Pro como fallback por su mayor capacidad de razonamiento sobre titulos y contenido heterogeneo |
| service-file-metadata-extractor | Extraer metadatos estructurados de archivos | Baja | gemini-2.5-flash | gpt-4.1-mini | Extracción de campos puntuales (titulo, fecha, organismo). Ventana de contexto reducida |
| service-tender-classifier | Clasificar sistema de evaluacion, factores y roles del pliego | Alta | gemini-2.5-flash | gpt-4.1-mini | Requiere comprension del marco normativo uruguayo. Flash con thinking budget como primario; mini como fallback |
| service-requirement-extractor | Extraer requerimientos atomicos del pliego via RAG iterativo | Alta | gpt-4.1-mini | gemini-2.5-flash | Alto volumen de llamadas (N batches x chunks). OpenAI como primario por el prompt estructurado con ejes definidos; Flash con thinking budget como fallback |
| service-compliance-matcher | Evaluar cumplimiento de cada requerimiento por propuesta | Media | gemini-2.5-flash | gpt-4.1-mini | Evaluacion individual por requerimiento con RAG. Volumen alto (1 llamada por requerimiento por propuesta) |
| service-compliance-summarizer | Generar resumen ejecutivo de cumplimiento por propuesta | Media | gemini-2.5-flash | gpt-4.1-mini | Una sola llamada por propuesta pero con contexto extenso (matriz completa). Mini maneja bien la sintesis |
| service-economic-offer-extractor | Extraer datos economicos estructurados de ofertas | Media | gemini-2.5-flash | gpt-4.1-mini | Extracción de tablas y montos con RAG. Precision numerica importante pero patron repetitivo |
