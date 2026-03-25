# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [1.0.0] - 2026-03-25

### Added
- Agregar área de carga unificada, consolidando las zonas separadas de "Pliego de Condiciones y Normativas" y "Ofertas" en una sola área de carga de documentos.
- Agregar campo opcional de nombre de análisis, enviado como `user_name` al backend.
- Agregar Vercel Web Analytics para monitoreo de uso de la aplicación.
- Agregar página `/tech` con documentación completa del stack tecnológico y enlace en el footer.
- Agregar componente Footer y página `/terms` con términos y condiciones.
- Agregar funcionalidad de chat con documentos, incluyendo restauración de historial y visualización del nombre de archivo en el encabezado.
- Agregar badge rediseñado para la propuesta con mayor puntaje, con gráfico de cumplimiento y resaltado visual.
- Agregar puntaje de cumplimiento (`compliance_score`) y resumen de cumplimiento (`compliance_summary`) a las vistas de propuestas.
- Agregar tarjeta de metadatos del proveedor (`provider_metadata`) en el detalle de propuesta, con formato JSON legible.
- Agregar auto-refresh en la visualización del workflow para reflejar cambios en tiempo real.
- Agregar health checks expandidos en la página de administración para Supabase, Qdrant y Azure.
- Agregar autenticación con API key del backend en todas las rutas API, incluyendo health checks.
- Agregar página de administración (`/admin`) con verificación de estado del backend.
- Agregar navegación directa a análisis específicos por ID desde la UI.
- Agregar visualización de resultados de cumplimiento y listado de propuestas por análisis.
- Agregar componente de visualización de workflow con árbol interactivo y curvas SVG bezier.
- Agregar página de requerimientos del análisis con scroll infinito.
- Agregar scroll infinito para chunks y nuevo diseño de tarjetas para detalles de archivos.
- Agregar visualización y gestión de chunks extraídos por archivo de análisis.
- Agregar agrupación de archivos de propuesta por proveedor o etiqueta con indicador de estado de procesamiento.
- Agregar componentes `AnalysisCard` y `MetricBox` para mostrar métricas de análisis.
- Agregar páginas dedicadas para archivos y eventos de un análisis (extraídas del detalle).
- Agregar página de detalle de análisis (`/analyses/[id]`) con visualización de archivos, eventos y estado.
- Agregar página de listado de análisis (`/analyses`) con agrupación por activos y completados.
- Agregar componentes `Navbar`, `UploadSection`, `AnalysisList` y `StatusCheckSection`.
- Agregar páginas de error (`error.tsx`) y no encontrado (`not-found.tsx`).
- Agregar funcionalidad de carga de archivos PDF con empaquetado ZIP en el cliente y envío al backend.
- Agregar componentes base de shadcn/ui: button, card y skeleton.
- Agregar proxy de API server-side para todas las rutas, protegiendo el API key del backend.

### Changed
- Estandarizar nombres de variables de entorno para rutas API del backend.
- Unificar rutas API bajo `API_ANALYSES_PATH` y refactorizar endpoints de proxy.
- Consolidar categorías de carga de archivos: unificar "Pliego de Condiciones" y "Normativas" en una sola categoría, y renombrar "Ofertas" a "Oferta".
- Mejorar funcionalidad de descarga de archivos con enlaces directos.

### Fixed
- Corregir iconos y ajustes visuales menores en la interfaz de carga.

[Unreleased]: https://github.com/iaaccsa/accsa-licitaciones-ui/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/iaaccsa/accsa-licitaciones-ui/releases/tag/v1.0.0
