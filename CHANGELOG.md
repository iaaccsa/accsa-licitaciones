# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Agregar endpoint `POST /api/v1/qdrant/collections` para crear colecciones en Qdrant con configuración de nombre, tamaño de vector y distancia.
- Agregar endpoint `GET /api/v1/files/{file_id}` para obtener un archivo por su ID.
- Implementar patrón de orquestación fan-out para el servicio `qdrant-by-file`, lanzando N instancias de Azure Container App Job (una por archivo procesado) y esperando a que todas completen antes de continuar el pipeline.

### Changed
- Actualizar DAG del pipeline para que `service-files-converter` enrute a `qdrant-by-file` (fan-out) antes de `service-setup-qdrant`. Agregar campo `fan_out_by` a la configuración del pipeline.
- Actualizar callback de jobs (`POST /api/v1/jobs/callback`) para aceptar `file_id` opcional, identificando instancias de jobs fan-out.

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

[Unreleased]: https://github.com/iaaccsa/accsa-licitaciones-api/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/iaaccsa/accsa-licitaciones-api/releases/tag/v1.0.0
