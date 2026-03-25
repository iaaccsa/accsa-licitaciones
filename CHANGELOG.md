# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Agregar `service-qdrant-by-file` para indexación dedicada por archivo individual en Qdrant, con integración en pipeline CI/CD y script de creación de Container App Job.
- Agregar variables `API_JOBS_CALLBACK` y `API_REQUIREMENTS_PATH` al pipeline de Azure.

### Changed
- Simplificar `service-file-extractor` eliminando la lógica de carpetas de propuestas y categorización automática; los archivos se procesan de forma plana directamente asociados al análisis.
- Simplificar `service-files-converter` eliminando lógica de propuestas, archivos combinados y merges; los archivos convertidos se asocian directamente al análisis sin categoría.
- Migrar `service-files-converter` de `llama-parse` a SDK `llama_cloud`, utilizando el tier agentic de parsing con soporte OCR en español.

## [0.9.0] - 2026-02-23

### Added
- Agregar `service-proposal-scorer` para puntuación automatizada de propuestas, incluyendo integración en pipeline CI/CD y script de creación de Container App Job.
- Agregar estado `unprocessable` al servicio `verify-compliance` para manejar archivos que no pueden ser procesados.
- Agregar `service-metadata-extractor` para extracción de metadatos de proveedores, incluyendo nueva columna `provider_metadata` en base de datos.
- Agregar mecanismo de retry con backoff exponencial en todos los servicios para mayor resiliencia ante fallos transitorios.
- Agregar validación de formato de rutas API en todos los Dockerfiles durante el build.

### Changed
- Migrar de OpenAI a Gemini como LLM principal en los servicios de procesamiento.
- Refactorizar `verify-compliance` para procesar todas las propuestas de un análisis en una sola ejecución de job.
- Renombrar `service-iterative-requirement-extractor` a `service-requirement-extractor`.
- Actualizar servicios `chunk-and-index`, `requirement-extractor` y `verify-compliance` al patrón canónico del proyecto y habilitarlos en el pipeline.
- Actualizar `service-setup-qdrant` al patrón canónico y habilitarlo en el pipeline.

### Fixed
- Corregir callback de éxito en `requirement-extractor` cuando no se encuentran chunks relevantes.
- Corregir payload de estado en `notify_failure` en todos los servicios.
- Corregir migración del SDK `google-generativeai` (deprecado) al nuevo SDK `google-genai`.
- Corregir propagación de errores en callbacks que se estaban silenciando.

## [0.8.0] - 2026-02-21

### Added
- Agregar funcionalidad de callback de jobs para reportar estado de finalización de servicios al backend.
- Habilitar `service-files-converter` en el pipeline de Azure.
- Agregar variables de entorno para artifacts de Supabase, Google API y rutas de API configurables.
- Migrar logging de eventos para usar la API del backend en lugar de interacción directa con Supabase.

### Changed
- Consolidar scripts de build y push en un único punto de entrada configurable (`build-and-push.sh` con modos `local`/`azure`).
- Renombrar `SUPABASE_SERVICE_ROLE_KEY` a `SUPABASE_SERVICE_KEY` en todos los servicios y configuraciones.
- Eliminar funcionalidad de logging de pasos de workflow y configuraciones asociadas.
- Consolidar creación de Azure Container App Jobs en un único script centralizado.

## [0.7.0] - 2026-02-20

### Added
- Agregar configuración inicial de Azure Pipelines con estrategia matrix para build paralelo de servicios.
- Agregar validación en tiempo de build de variables de entorno requeridas en los Dockerfiles.
- Implementar logging de pasos de workflow con utilidad `log_workflow_step` y plantillas JSON.
- Implementar estrategia de build condicional para compilar solo servicios modificados.

### Changed
- Estandarizar nombres de imágenes y variables de registro en scripts de build y deploy.
- Separar validaciones de build args en comandos RUN individuales en Dockerfiles para mejor claridad y caching.
- Separar scripts de build en versiones locales y Azure por servicio.

### Fixed
- Corregir uso de `REGISTRY_NAME` explícito para obtención de credenciales ACR en script de creación de jobs.

## [0.6.0] - 2026-02-18

### Added
- Agregar `service-verify-compliance` para auditoría de propuestas con IA, incluyendo búsqueda semántica en Qdrant, reranking con Cohere y evaluación con GPT-4.
- Agregar logging de eventos para completado de extracción de archivos e inicio de configuración de Qdrant.

## [0.5.0] - 2026-02-16

### Added
- Agregar `service-setup-qdrant` para creación y configuración de colecciones vectoriales en Qdrant.
- Agregar `service-files-converter` para conversión de PDFs a Markdown mediante LlamaParse.
- Implementar logger compartido `supabase_logger.py` con funciones `setup_logger()`, `log_event()` y `mark_failed()`.
- Estandarizar carga de variables de entorno desde `.env.local` para desarrollo local.

## [0.1.0] - 2026-02-14

### Added
- Agregar `service-file-extractor` como primer servicio del proyecto, para descarga y extracción de archivos ZIP desde la API de licitaciones.
- Establecer estrategia de despliegue con Azure Container Apps Jobs, incluyendo scripts de build, push y creación de jobs.
- Agregar documentación inicial de infraestructura y despliegue.
