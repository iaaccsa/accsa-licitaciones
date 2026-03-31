# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [1.1.0] - 2026-03-31

### Added
- Agregar tabla de licitaciones (`tenders`) con endpoints CRUD completos (listar, buscar, crear, obtener, actualizar) y campos `tender_id`, `tender_label`, `tender_provider_name` en la vista de archivos.
- Agregar endpoint `GET /api/v1/analyses/{analysis_id}/sources` para obtener la lista combinada de propuestas y licitaciones de un análisis.
- Agregar mecanismo de pausa y aprobación en el pipeline, con flag `pause_after` configurable y endpoint `POST /api/v1/analyses/{analysis_id}/resume` para continuar la ejecución.
- Agregar endpoint `PATCH /api/v1/analyses/{analysis_id}` para actualizar el nombre generado de un análisis.
- Agregar endpoint de limpieza para eliminar análisis, buckets de almacenamiento y colecciones de Qdrant.
- Agregar etapa de clasificación de documentos (`service-documents-clasification`) como etapa final del pipeline, incluyendo campo `category` en el schema de archivos.
- Agregar soporte de `file_metadata` (JSONB) y servicio `service-file-metadata-extractor` conectado al pipeline tras `service-qdrant-by-file`.
- Agregar servicios `rag-setup` y `joiner` al pipeline, actualizando dependencias de `file-metadata-extractor` y `documents-clasification`.
- Agregar campo `link` al schema de archivos para FK auto-referencial entre archivos relacionados.
- Agregar campo `proposal_id` al schema `FileUpdate` para asignación de archivos a propuestas.
- Agregar lógica de asignación de archivos a propuestas/licitaciones con sincronización de categoría, limpiando IDs mutuamente excluyentes y propagando cambios a archivos vinculados.
- Agregar campo `is_reorderable` a archivos para controlar si se permite reasignar propuesta, licitación o categoría.
- Agregar bloqueo de reordenamiento de archivos al reanudar desde `service-documents-clasification`, con validación HTTP 400 en `PATCH /files/{id}` cuando `is_reorderable` es falso.
- Agregar valor `unclassified` al enum `file_type`.
- Agregar endpoint `POST /api/v1/analyses/{analysis_id}/cancel` para cancelar un análisis, deteniendo los Azure Container Apps Jobs en ejecución y marcando los jobs como cancelados.
- Agregar campo `metadata` (JSONB) al schema de archivos para almacenar metadata arbitraria vía `PATCH /files/{file_id}`.
- Agregar valor `cancelled` al enum `job_status`.
- Agregar campo `user_name` como parámetro en `POST /api/v1/analyses/` para asociar un nombre de usuario al crear un análisis.
- Agregar endpoint `POST /api/v1/qdrant/collections` para crear colecciones en Qdrant con configuración de nombre, tamaño de vector y distancia.
- Agregar endpoint `GET /api/v1/files/{file_id}` para obtener un archivo por su ID.
- Implementar patrón de orquestación fan-out para `service-qdrant-by-file` y `service-chunk-and-index`, lanzando N instancias de Azure Container App Job (una por archivo) y esperando a que todas completen antes de continuar.
- Agregar archivo `services.json` para definir servicios del flujo RAG incluyendo setup, chunking, indexing y extracción.

### Changed
- Renombrar servicio `qdrant-by-file` a `service-qdrant-by-file` en la configuración del pipeline para mantener consistencia de nomenclatura.
- Actualizar DAG del pipeline para que `service-files-converter-mistral` enrute a `service-qdrant-by-file` (fan-out) antes de `service-setup-qdrant`. Agregar campo `fan_out_by` a la configuración del pipeline.
- Actualizar callback de jobs (`POST /api/v1/jobs/callback`) para aceptar `file_id` opcional, identificando instancias de jobs fan-out.
- Hacer campos `analysis_id`, `is_reorderable`, `is_merged` y `created_at` obligatorios (NOT NULL) en el schema de archivos.

### Fixed
- Corregir vista `analyses_view` que no incluía las columnas `user_name` y `generated_name`, recreando la vista con los campos faltantes.
- Agregar columna `file_id` faltante a la tabla `jobs` en la base de datos.

## [1.0.0] - 2026-03-25

### Added
- Implementar estructura inicial del proyecto FastAPI con endpoints, servicios, repositorios y schemas para gestionar análisis, requisitos, archivos y eventos, con integración a Supabase.
- Agregar gestión de propuestas incluyendo endpoint, servicio, repositorio y schemas.
- Agregar búsqueda de workflow steps por ID de análisis con endpoint, servicio, repositorio y schemas.
- Agregar integración con Qdrant para búsqueda vectorial y endpoints de resultados de cumplimiento.
- Agregar endpoint de creación de análisis con carga de archivos ZIP, incluyendo almacenamiento en Supabase Storage, registro de eventos e inicialización de workflow steps.
- Implementar autenticación global por API Key (`X-API-Key`) para todas las rutas de `/api/v1`.
- Implementar orquestación de jobs para gestionar pipelines de procesamiento mediante Azure Container Apps y un árbol de dependencias de jobs.
- Agregar repositorio de jobs y persistencia de detalles de ejecución al lanzar Azure Container Apps Jobs.
- Implementar actualización de estado de análisis, creación de archivos y propuestas, y registro de eventos durante el pipeline.
- Agregar endpoint de upsert para workflow steps, permitiendo creación o actualización por `analysis_id` y `code`.
- Orquestar workflow steps dinámicos desde configuración JSON, gestionando su ciclo de vida durante la ejecución de jobs.
- Agregar endpoints de health check para Supabase, Qdrant y Azure con verificación de conexión.
- Agregar lectura de análisis desde `analyses_view` para incluir conteos agregados.
- Marcar workflow step como fallido cuando un Azure job falla al lanzarse.
- Agregar endpoints faltantes para comunicación con servicios de Azure (archivos, eventos, requisitos).
- Agregar endpoints `PATCH /proposals/{id}` y `GET /proposals/?analysis_id` para actualización y consulta de propuestas.
- Agregar servicio `service-metadata-extractor` al pipeline de dependencias.
- Agregar ENUM `compliance_result_status` y vista `proposals_view` con conteos.
- Agregar endpoints de búsqueda de propuestas con conteos (`search-with-counts`) y actualización de puntuación (`score`).
- Agregar endpoint de chat con recuperación de historial de conversaciones.
- Marcar etapa del pipeline como final, y agregar campos `user_name` y `generated_name` al schema de análisis.

### Changed
- Migrar configuración de dependencias de jobs a un modelo basado en servicios, reemplazando `jobs_tree.json` por `services_dependency.json`.
- Renombrar `job_name` a `service_name` en la orquestación de jobs.
- Renombrar endpoint de health check de base de datos para verificar explícitamente la conexión a Supabase.
- Renombrar `service-iterative-requirement-extractor` a `service-requirement-extractor`.
- Unificar configuración del pipeline en un solo archivo `pipeline_config.json`.
- Traducir nombre de display del scorer de propuestas a "Puntuación de Propuestas".

### Fixed
- Corregir marcado de workflow step como fallido y uso correcto del estado de job en callback de fallo.
- Corregir marcado de análisis como listo (`is_success=true`) cuando el job final del pipeline completa exitosamente.

[Unreleased]: https://github.com/iaaccsa/accsa-licitaciones-api/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/iaaccsa/accsa-licitaciones-api/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/iaaccsa/accsa-licitaciones-api/releases/tag/v1.0.0
