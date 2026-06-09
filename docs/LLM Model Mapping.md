# LLM Model Mapping

Modelos asignados por servicio segun complejidad de la tarea. El embedding model (`text-embedding-3-small` de OpenAI) se mantiene sin cambios en los servicios que lo usan.

| Servicio | Tarea LLM | Complejidad | Primary | Fallback | Justificacion |
|---|---|---|---|---|---|
| service-documents-classifier | Clasificar tipo de documento (pliego, anexo, adenda, etc.) | Baja | gemini-2.5-flash | gpt-4.1-mini | Clasificacion con categorias fijas y contexto corto. No requiere razonamiento complejo |
| service-documents-grouper | Agrupar documentos por similitud de contenido | Baja | gemini-2.5-flash | gpt-4.1-mini | Agrupacion basica comparando titulos y contenido. Patron repetitivo |
| service-file-metadata-extractor | Extraer metadatos estructurados de archivos | Baja | gemini-2.5-flash | gpt-4.1-mini | Extracción de campos puntuales (titulo, fecha, organismo). Ventana de contexto reducida |
| service-tender-classifier | Clasificar sistema de evaluacion, factores y roles del pliego | Alta | gemini-2.5-flash | gpt-4.1-nano | Requiere comprension del marco normativo uruguayo. Flash es suficiente como primario; nano como fallback por el prompt bien estructurado |
| service-requirement-extractor | Extraer requerimientos atomicos del pliego via RAG iterativo | Alta | gemini-2.5-flash | gpt-4.1-nano | Alto volumen de llamadas (N batches x chunks). El prompt guia la extracción con ejes definidos, lo que permite modelos mas livianos |
| service-compliance-matcher | Evaluar cumplimiento de cada requerimiento por propuesta | Media | gemini-2.5-flash | gpt-4.1-mini | Evaluacion individual por requerimiento con RAG. Volumen alto (1 llamada por requerimiento por propuesta) |
| service-compliance-summarizer | Generar resumen ejecutivo de cumplimiento por propuesta | Media | gemini-2.5-flash | gpt-4.1-mini | Una sola llamada por propuesta pero con contexto extenso (matriz completa). Mini maneja bien la sintesis |
| service-economic-offer-extractor | Extraer datos economicos estructurados de ofertas | Media | gemini-2.5-flash | gpt-4.1-mini | Extracción de tablas y montos con RAG. Precision numerica importante pero patron repetitivo |
