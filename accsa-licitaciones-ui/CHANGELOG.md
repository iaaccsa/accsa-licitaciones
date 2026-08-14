# Changelog

Changelog unificado del sistema Licitaciones, con una sección por proyecto
(`accsa-licitaciones-ui`, `accsa-licitaciones-api`, `accsa-licitaciones-services`).

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El sistema adhiere a [Semantic Versioning](https://semver.org/lang/es/) con una
**versión única compartida** por los tres proyectos: a partir de `2.0.0`, los tres
se versionan y publican en conjunto.

## [Unreleased]

### accsa-licitaciones-ui

#### Changed
- Los documentos ahora se suben de a uno en vez de empaquetarse todos juntos en el navegador antes de enviarlos. Con lotes de tamaño real el navegador se quedaba sin memoria y la pantalla quedaba detenida, sin barra de progreso ni mensaje de error. Ahora la subida muestra el avance ("Subiendo 137 de 420 archivos"), reintenta sola cuando se corta la conexión y, si un archivo no se puede subir, avisa cuál fue y no inicia el análisis. Deja de aplicar el tope de 1 GB por paquete: el límite pasa a ser el tamaño total del lote, configurable con `NEXT_PUBLIC_MAX_UPLOAD_TOTAL_MB` (2 GB por defecto).
- Dos documentos con el mismo nombre en carpetas distintas ya no se pisan entre sí: antes uno reemplazaba al otro al desempaquetar y se perdía.
- Una subida larga ya no cierra la sesión por inactividad mientras está en curso.

#### Added
- La lista de análisis ahora permite buscar por nombre y elegir el orden (más recientes, más antiguos o alfabético). La búsqueda ignora mayúsculas y acentos, y al cambiarla se vuelve a la primera página.
- Los campos de contraseña ahora tienen un botón para mostrar u ocultar lo escrito, en el inicio de sesión y en la creación de contraseña.

#### Fixed
- Un análisis que termina sin nada que evaluar ya no se muestra como "Completado" en verde. Ahora lleva un cartel que explica el motivo y un estado propio, distinto según el caso: "Sin requisitos de admisibilidad" cuando el pliego no tenía requisitos o se dejaron todos sin confirmar, y "Sin propuestas admitidas" cuando ninguna propuesta pasó el chequeo. En el listado esos análisis figuran como "Terminado sin resultados". Antes se leían como un análisis exitoso que quedó vacío por un error.
- La barra de progreso de un análisis terminado con éxito ahora marca 100%. Antes podía quedar en 75% u 80% junto al cartel "Completado", porque el porcentaje se calculaba promediando las etapas y las que el sistema saltea a propósito (por ejemplo cuando ninguna propuesta pasa la admisibilidad) contaban como no hechas. En los análisis en curso o fallidos la barra sigue mostrando el avance real.
- La barra de progreso ya no se dibuja más llena de lo que corresponde cuando el porcentaje es bajo: con valores chicos el relleno ocupaba el ancho del número en vez del avance real.
- Los mensajes de validación de los formularios ahora se muestran siempre en español, sin importar el idioma configurado en el navegador. Antes, con el navegador en inglés, avisos como el de correo electrónico mal escrito aparecían en ese idioma. Alcanza a los campos de inicio de sesión, creación de contraseña, invitación de usuarios y filtros de fecha de auditoría.
- Las propuestas rechazadas en la admisibilidad dejan de aparecer en "Resumen de Propuestas" y en "Comparativa de Ofertas Económicas". Las propuestas que todavía no tienen la admisibilidad resuelta se siguen mostrando.
- Al editar el nombre de un análisis, el campo ahora abre con el nombre actual cargado y se puede corregir una parte sin reescribirlo entero. Además se quitó el nombre anterior que quedaba visible debajo del título después de renombrar.

### accsa-licitaciones-services

#### Changed
- `service-file-extractor` deja de descargar y descomprimir un paquete único: ahora lee el listado del lote y procesa los documentos de a uno, descargándolos directo a disco. Antes cargaba el paquete entero en memoria, lo que hacía fallar el paso con lotes grandes. El análisis arranca más rápido porque se ahorra transferir todos los documentos dos veces.

### accsa-licitaciones-api

#### Fixed
- Si el análisis se crea pero el procesamiento no llega a arrancar, ahora se informa el error en vez de mostrar "Análisis iniciado con éxito" sobre un análisis que quedaba detenido para siempre.
- Si en la revisión de los requisitos de admisibilidad se dejan todos sin confirmar, el análisis ahora se cierra explicando el motivo. Antes el chequeo de admisibilidad no encontraba ningún requisito que verificar y daba por admitidas a todas las propuestas, con lo que el análisis terminaba como aprobado sin haber controlado nada.

## [2.2.0] - 2026-07-28

### accsa-licitaciones-ui

#### Changed
- El análisis ahora se detiene a pedir aprobación en cuatro momentos en vez de tres: se agrega una pausa propia tras la extracción de requisitos de admisibilidad, con su punto rojo en la tarjeta "Requisitos de Admisibilidad" y su correo de aviso. Las fases del análisis pasan a ser nueve y en el orden nuevo: la admisibilidad se resuelve completa antes de la extracción de los otros requisitos.

#### Fixed
- La sesión ahora expira tras un período de inactividad (30 minutos por defecto, configurable con `NEXT_PUBLIC_INACTIVITY_TIMEOUT_MINUTES`): al volver a operar se solicita iniciar sesión de nuevo y no se muestran datos protegidos. Antes la sesión no vencía por inactividad ni al cerrar y volver a abrir el navegador.

### accsa-licitaciones-api

#### Changed
- Reordenar el pipeline para resolver la admisibilidad primero: agrupación de documentos, extracción de requisitos de admisibilidad, indexación por propuesta, match y chequeo de admisibilidad, y recién después la determinación del sistema de evaluación y la extracción de los otros requisitos.

#### Added
- Si el pliego no tiene requisitos de admisibilidad, el análisis se cierra como completado sin ejecutar los pasos restantes, dejando registrado el motivo en los eventos.
- Si ninguna propuesta queda admitida, ya no se ejecutan la determinación del sistema de evaluación, la extracción de otros requisitos ni el chequeo de cumplimiento, tampoco cuando la admisibilidad se aprueba manualmente. Antes ese ahorro solo ocurría con la aprobación automática desactivada.

### accsa-licitaciones-services

#### Added
- Agregar `service-admissibility-extractor`, que extrae los requisitos de admisibilidad del pliego con un prompt propio, editable por separado desde la pantalla de prompts del admin.

#### Changed
- `service-requirement-extractor` queda solo con la extracción de los otros requisitos: ya no hace la segunda pasada de admisibilidad.

## [2.1.0] - 2026-07-13

### accsa-licitaciones-ui

#### Added
- Agregar modo oscuro en toda la aplicación (páginas, componentes, gráficos y visualización del workflow), con selector de tema claro/oscuro/sistema.
- Agregar sección de Ayuda (`/ayuda`) con 29 artículos de documentación para el usuario, organizados por grupos con índice lateral, tabla de contenidos, resaltado de la sección visible y búsqueda local; nueva entrada "Ayuda" en la barra de navegación.
- Agregar asistente de documentación: widget de chat flotante disponible en toda la aplicación que responde preguntas sobre el uso del sistema consultando los artículos de Ayuda, con proxy del lado del servidor hacia el chatbot de documentación.
- Agregar menú de usuario en la barra de navegación (correo de la sesión, cambio de tema y cierre de sesión) y rediseñar las páginas de autenticación (login, confirmación de invitación y creación de contraseña); el login ahora aclara que las cuentas nuevas las crea un administrador.
- Agregar vista "Admisibilidad" del análisis con las propuestas agrupadas en admitidas, rechazadas y sin resolver y un toggle para admitir o rechazar cada una; la vista de requisitos de admisibilidad pasa a su propia ruta y las tarjetas de navegación del análisis se reorganizan (se quita la tarjeta "Propuestas").
- Agregar página de credenciales de infraestructura en el admin, con campos de solo escritura enmascarados para las claves de proveedores (Qdrant, OpenAI, Google, Mistral), estado por clave (configurada y última actualización) y aviso cuando falta una clave requerida.
- Agregar artículo de Ayuda "Cómo se clasifican los requisitos", que explica roles, dominios, métodos de verificación, alcance, peso y citas con ejemplos.
- Agregar artículo de Ayuda "Tipos de sistema de evaluación", con el catálogo de los 7 sistemas que detecta el clasificador, incluyendo fórmulas y advertencias.
- Agregar enlaces cruzados hacia los nuevos artículos de Ayuda desde "Requisitos extraídos", "Requisitos de admisibilidad" y "Sistema de evaluación".
- Agregar breadcrumb de navegación en todas las vistas de un análisis, con el nombre del análisis y la sección actual (archivos, propuestas, requisitos, etc.).
- Agregar la variable de entorno `AUTH_DISABLED` (solo desarrollo) que deshabilita la autenticación para revisar el sitio completo sin sesión; en builds de producción es inerte.
- Agregar suite de tests e2e con Playwright (`pnpm test:e2e`) que recorre todas las vistas de la aplicación con la autenticación deshabilitada.
- Agregar el botón "Validar y continuar" en la vista de archivos del análisis, visible solo cuando el análisis está a la espera de validar la clasificación de archivos, con un diálogo de confirmación que advierte que una vez validada la clasificación no podrá volver a editarse antes de reanudar el pipeline.

#### Changed
- Ampliar el artículo de Ayuda "Revisión y auditoría" con el detalle de qué acciones de usuario se registran.
- Unificar el ancho de todas las vistas para que el contenido quede alineado con la barra de navegación y el pie de página; las páginas de lectura (términos, changelog, chat de archivo) mantienen su ancho angosto.
- Rediseñar la vista de archivos del análisis: englobar el contenido en una sola tarjeta titulada "Archivos del análisis", presentar cada sección (pliego y normativas, oferta por proveedor y sin clasificar) como tarjeta con su conteo de archivos, y simplificar cada fila de archivo con una barra de acciones (mover, excluir, chunks, chat, ver y descargar); se quitan el tamaño del archivo y la insignia "chunks: N" (los chunks quedan como ícono).
- Rediseñar las vistas "Requisitos" y "Requisitos de admisibilidad": englobar el contenido en una sola tarjeta con el título, las acciones masivas ("Confirmar todos" y "Rechazar todos") y la paginación, y presentar cada requisito como tarjeta colapsable; colapsada muestra el código, el texto, el resumen y el toggle Confirmar/Rechazar (verde o rojo según el estado), y expandida muestra las etiquetas (rol, dominio, alcance, verificación, confianza), el peso, los factores y las citas abiertas por defecto. En admisibilidad se agregan las etiquetas de rol y método de verificación, que existían en los datos pero no se mostraban.
- Rediseñar la "Matriz de Cumplimiento" y la "Admisibilidad" de cada propuesta con el mismo formato de tarjetas colapsables que las vistas de requisitos: tarjeta contenedora con el título, los filtros sobre franja gris, y cada resultado colapsado muestra el código, el texto completo, el resumen, y al pie el estado de revisión (verificado o pendiente de revisión manual), la confianza y el veredicto; al expandir se muestran las etiquetas del requisito con nombres en español (antes aparecían los valores internos en inglés), el razonamiento, las citas, los elementos faltantes y las acciones de revisión (verificar y editar). Ambas vistas paginan de a 10 resultados con el mismo paginador que las vistas de requisitos (la matriz ahora carga todos los resultados y los filtros de rol y método aplican sobre el total, además de quedar corregido el filtro por método que usaba claves que no coincidían con los datos), y se elimina el enlace "Volver".
- Rediseñar el encabezado del detalle del análisis (chips tipo píldora con fechas, validación humana y slug sobre un título más grande) y mover la información de modelo y nivel de inteligencia al resumen del análisis en el admin.
- Rediseñar la tarjeta de progreso del workflow: barra de progreso global como píldora con degradado y porcentaje integrado, y botón de reanudar movido al encabezado de la tarjeta.
- Mover la sección "Evaluación" (sistema de evaluación) solo a la vista de administración; se quita su tarjeta de la vista de usuario del análisis.
- Migrar la carga de datos de 8 componentes a SWR (caché y revalidación automáticas).

#### Removed
- Eliminar la sección "Docs" de la interfaz (ruta `/docs`, su entrada en la barra de navegación y sus 11 páginas); el contenido útil para usuarios se trasladó a la Ayuda y el resto quedó como documentación interna del repositorio.
- Eliminar la ruta proxy `/api/tender-evaluation-types` (listado), que solo usaba la sección "Docs"; se mantiene `/api/tender-evaluation-types/by-label`.
- Eliminar la acción de cancelar un análisis (botón y ruta proxy) de las vistas de usuario y de admin; la insignia de estado "cancelado" se mantiene para datos existentes. También se deja de mostrar la insignia "a la espera de aprobación" en el encabezado del detalle (el estado se ve en el workflow).

#### Fixed
- Corregir la URL del proxy del chat de documentación cuando `CHATBOT_DOCS_URL` está configurada con barra final (se generaba una doble barra en la petición).

### accsa-licitaciones-api

#### Added
- Agregar configuración de infraestructura centralizada: las credenciales de proveedores (Qdrant, OpenAI, Google, Mistral) se guardan cifradas en Supabase Vault y el orquestador arma e inyecta el entorno de ejecución completo (29 variables) en cada job del pipeline, de modo que las imágenes de los services ya no necesitan configuración propia. Nuevos endpoints `GET`/`PUT` de configuración de infraestructura (el PUT queda auditado, registrando solo los nombres de las claves) y verificación previa al iniciar el pipeline que falla limpio (evento y estado de error, sin lanzar jobs) si falta una credencial.

#### Changed
- Hacer obligatoria la variable de entorno `SERVICE_API_BASE_URL` (antes traía la URL de producción como valor por defecto); la API falla al arrancar si no está definida.

#### Removed
- Eliminar el endpoint de cancelación de análisis (`POST /analyses/{id}/cancel`) y su lógica interna de cancelación de jobs y de pasos pendientes; el monitor de timeouts conserva su propio mecanismo para detener jobs.

### accsa-licitaciones-services

#### Changed
- Dejar las imágenes Docker sin configuración de aplicación (solo código y dependencias): se elimina toda la configuración de los 15 Dockerfiles, de los scripts de build y del pipeline de CI; el orquestador inyecta el entorno completo al lanzar cada job.
- Eliminar los valores por defecto de configuración: una variable de entorno no definida ahora corta la ejecución de inmediato en lugar de caer silenciosamente en un valor por defecto.

#### Fixed
- Corregir el extractor de requisitos para que un batch exitoso con 0 requisitos extraídos no cuente como fallido; en documentos con pocos requisitos esto disparaba por error el umbral de aborto del 10%.
- Corregir el renderizado de los prompts editables desde la base de datos: se sustituyen solo los placeholders conocidos (con `replace()` en lugar de `str.format()`), porque las llaves de los ejemplos JSON incluidos en los prompts hacían fallar el clasificador de documentos.

## [2.0.0] - 2026-06-24

Primer release unificado. Consolida el versionado de los tres proyectos (antes
UI 1.0.0, API 1.1.0, Services 1.2.0) bajo una sola versión e incorpora todos los
cambios acumulados desde sus últimos tags por proyecto. Incluye autenticación con
Supabase, workflow de admisibilidad, matriz de cumplimiento, oferta económica,
selección de modelo LLM, auditoría y tracking de costos de IA.

### accsa-licitaciones-ui

#### Added
- Agregar flujo de autenticación con login/logout, gestión de sesión y rate limiting; migrar luego de JWT por PIN a Supabase SSR.
- Forzar propiedad (ownership) de análisis por usuario y renombrar `user_name` a `user_assigned_name`.
- Agregar área de carga unificada, campo de nombre de análisis y vista de análisis en el panel de administración.
- Agregar campo `user_email` al formulario de carga y al detalle de análisis.
- Agregar carga directa navegador→backend (subida de ZIP a Supabase Storage) para sortear el límite de payload de Vercel.
- Agregar estado `awaiting_approval`, flujo de reanudación, mover/excluir archivos y rebranding.
- Agregar toggle de validación human-in-the-loop y selección de tier de modelo en el formulario de carga.
- Mover la selección de modelo LLM del formulario de carga a la página de configuración del admin.
- Agregar páginas de configuración del admin (notificaciones, human-loop y hub de ajustes).
- Agregar página de prompts en el admin con edición y guardado.
- Agregar visor de logs de auditoría en el admin y reenvío de headers de auditoría al backend.
- Agregar visor de metadatos (ícono y modal) en la vista de archivos del admin.
- Agregar vista de sistema de evaluación y tipos de evaluación de licitación con detalles de clasificación.
- Agregar página de propuestas con matriz de cumplimiento (rutas de proxy y componente), comparación y oferta económica.
- Agregar módulo de admisibilidad independiente (página con scroll infinito, matriz y rutas de API) y override de estado de admisibilidad (PATCH) en propuestas.
- Agregar campos y filtros de admisibilidad en las páginas de propuestas y requisitos.
- Agregar funcionalidad de cancelación en el detalle de análisis.
- Agregar visualización de fases del workflow e integración con la API; agregar columna `instances_count` a la página de flujo.
- Agregar nombre de archivo y número de página a las citas en la matriz de cumplimiento y requisitos.
- Agregar tarjeta de desglose de costos de IA en el detalle de análisis.
- Agregar manejo de archivos procesados (endpoint dedicado).
- Agregar vista nerd-graph y página de limpieza en el admin.
- Agregar páginas de documentación: arquitectura del sistema, pipeline, comparativa de APIs de OCR, métricas del extractor de requisitos, eventos de auditoría y auditoría de seguridad.

#### Changed
- Rediseñar las tarjetas de propuesta con layout en grilla y reestructurar la home con paginación en la lista de análisis.
- Reemplazar scroll infinito por paginación clásica en requisitos y agregar botones de verificación masiva.
- Reemplazar spinner por tarjetas skeleton en el estado de carga de la lista de análisis.
- Extraer las matrices de admisibilidad y cumplimiento a páginas dedicadas.
- Restringir el veredicto de admisibilidad en la UI a binario cumple/no_cumple.
- Manejar estados de pausa adicionales en el estado del análisis.
- Soportar múltiples parámetros de rol en las consultas.
- Aplicar correcciones de performance siguiendo las mejores prácticas de React/Vercel.
- Estandarizar terminología reemplazando "requerimientos" por "requisitos".
- Agregar configuración de workspace de pnpm para permitir builds de `sharp` y `unrs-resolver`.

#### Fixed
- Corregir manejo de error ante rutas de API faltantes en ofertas económicas y fases.
- Corregir construcción de URL para el override de admisibilidad (PATCH).
- Corregir visualización de `compliance_rate` en las vistas de propuestas.
- Corregir ortografía en español (acentos faltantes) en la interfaz.

#### Removed
- Eliminar la ruta obsoleta de confirmación de autenticación.

### accsa-licitaciones-api

#### Added
- Agregar sistema de tokens de carga (`X-Upload-Token`) para subida directa navegador→backend; `POST /analyses/` acepta `storage_path` en JSON en vez de archivo.
- Agregar flujo de propiedad de análisis: filtro `created_by` y campo `user_assigned_name`.
- Agregar workflow de admisibilidad con endpoints de requisitos y resultados de admisibilidad (incluye inserción por lotes).
- Agregar API de matriz de cumplimiento y rediseñar la máquina de estados de propuestas; agregar parámetro `order` para ordenar consultas.
- Agregar gestión de oferta económica (CRUD) integrada al flujo de propuestas.
- Agregar selección de modelo: campos de modelo primario y nivel de inteligencia, endpoints de tier de modelo y resolución de configuración de modelo por análisis.
- Agregar configuración global de la app para LLM, y endpoints/servicio de configuración de HITL y notificaciones.
- Agregar flag HITL para saltar fases de aprobación y pausas, con auto-continuación cuando está desactivado.
- Agregar endpoints de gestión de prompts de servicios.
- Agregar logging de auditoría en endpoints clave.
- Agregar módulos de precios y tracking de uso de IA, con endpoint de resumen de costos.
- Agregar gestión de fases del workflow (inicialización, progreso, búsqueda y activación de la siguiente fase), cargadas desde configuración externa.
- Agregar reclamo atómico de workflow steps y soporte de `instances_count` para jobs fan-out.
- Agregar monitor de jobs en segundo plano para detectar y fallar análisis que exceden el timeout.
- Agregar notificaciones por email (Mailgun) ante cambios de estado del pipeline, con resumen de admisibilidad en los emails de aprobación.
- Agregar endpoints de `tender-classifications` y `tender-evaluation-types` (incluye búsqueda por label) y campos de perfil de evaluación v2.
- Reescribir el endpoint de requisitos del análisis con reemplazo masivo, filtros, PATCH y verificación masiva.
- Agregar al pipeline `service-tender-classifier`, el servicio de extracción de requisitos, `service-compliance-matcher`, `service-build-proposal-index` y `service-economic-offer-extractor`.
- Agregar endpoint `GET /analyses/{id}/proposals` (vía `proposals_view`).
- Agregar `page_number` y `filename` a las citas de cumplimiento y requisitos.
- Agregar endpoint para reintentar manualmente jobs fallidos del workflow.
- Agregar endpoints de borrado por análisis (archivos originales/procesados, propuestas y licitaciones) y por propuesta.
- Agregar campo `user_email` a análisis.
- Permitir múltiples valores en los filtros `role` y `verification_method`.
- Deshabilitar la documentación de la API en producción según `APP_ENV`.

#### Changed
- Renombrar `service-files-converter` a `service-files-converter-mistral` y `service-digital-signature-extractor` a `service-digital-sig-extractor` en el pipeline y la documentación.
- Refactorizar el manejo de archivos en endpoints de archivos originales y procesados.
- Mover `service-admissibility-gate` antes de `compliance-matcher`, reordenar servicios del pipeline y actualizar las fases.
- Saltar jobs posteriores cuando ninguna propuesta es admitida; finalizar el pipeline cuando todos los jobs finales completan.
- Mejorar la orquestación de jobs con mapeo de job padre y `original_file_id` en el callback.
- Restringir el veredicto de admisibilidad a binario cumple/no_cumple.
- Actualizar y renombrar las fases del workflow y ajustar el timeout de jobs.
- Aumentar el límite de reintentos ARM en el cliente de Azure.

#### Fixed
- Corregir consulta de clasificación de licitación usando `.maybe_single()`.
- Corregir guarda de callback concurrente devolviendo lista vacía en vez de variable indefinida.
- Corregir asuntos de email y acento faltante en la plantilla de aprobación pendiente.
- Corregir `matching_started_at` haciéndolo opcional con default UTC.
- Corregir códigos de servicio y dependencias en la configuración del pipeline.

#### Removed
- Eliminar el parámetro obsoleto `is_admissibility` de la matriz de cumplimiento.

### accsa-licitaciones-services

#### Added
- Agregar `service-files-converter-mistral` usando Mistral OCR, con validación de tamaño de PDF y reintentos en el procesamiento.
- Agregar `service-tender-classifier` y expandirlo para emitir el perfil de evaluación completo.
- Agregar `service-compliance-matcher` y `service-compliance-summarizer`.
- Agregar `service-economic-offer-extractor` para extracción estructurada de oferta económica.
- Agregar `service-digital-sig-extractor` para extracción de firmas digitales.
- Agregar `service-admissibility-gate` y `service-admissibility-matcher` para evaluación de admisibilidad.
- Agregar fallback a OpenAI en `documents-classifier` cuando Gemini falla.

#### Changed
- Migrar el proveedor LLM principal de Gemini a OpenAI.
- Seleccionar el modelo LLM en runtime desde la configuración de la API y actualizar versiones de modelos en varios servicios.
- Cargar los prompts desde la API/DB en runtime (con script de seed) en lugar de archivos locales.
- Agregar logging de uso y tracking de costos de IA en todos los servicios.
- Mejorar el manejo de errores y reintentos en la extracción (códigos de proveedor no disponible, resultados estructurados con `BatchOutcome`).
- Agregar normalización y validadores de campos en `tender-classifier` y `requirement-extractor`, forzando idioma español en `requirement_text`, `requirement_summary` y `notes`.
- Quitar el matching de admisibilidad de `compliance-matcher` y el campo `is_admissibility` del modelo de requisito; colapsar el veredicto de admisibilidad a binario.
- Renombrar `API_FILES_PATH` a `API_PROCESSED_FILES_PATH` e incluir `proposal_id`/`original_file_id` en los payloads del callback de jobs.

#### Fixed
- Corregir importación e instalación del SDK de Mistral (pin de versión y ruta de import) y reintentar la URL firmada ante 404 en el conversor.
- Corregir clasificación para asegurar que todos los archivos queden clasificados (fallback OpenAI y manejo de `unclassified`).
- Corregir terminología "requerimiento" → "requisito" en varios módulos.

#### Removed
- Eliminar el skill `service-creator` y recursos asociados.
- Deprecar (archivar) servicios obsoletos: `proposal-scorer`, `verify-compliance`, `chunk-and-index`, `joiner` y `files-converter-llama`.

---

## Historial previo (pre-unificación)

Versiones independientes por proyecto previas a la unificación en `2.0.0`. Se
conservan tal como fueron publicadas en cada repositorio.

### accsa-licitaciones-ui

#### [1.0.0] - 2026-03-25

##### Added
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

##### Changed
- Estandarizar nombres de variables de entorno para rutas API del backend.
- Unificar rutas API bajo `API_ANALYSES_PATH` y refactorizar endpoints de proxy.
- Consolidar categorías de carga de archivos: unificar "Pliego de Condiciones" y "Normativas" en una sola categoría, y renombrar "Ofertas" a "Oferta".
- Mejorar funcionalidad de descarga de archivos con enlaces directos.

##### Fixed
- Corregir iconos y ajustes visuales menores en la interfaz de carga.

### accsa-licitaciones-api

#### [1.1.0] - 2026-03-31

##### Added
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

##### Changed
- Renombrar servicio `qdrant-by-file` a `service-qdrant-by-file` en la configuración del pipeline para mantener consistencia de nomenclatura.
- Actualizar DAG del pipeline para que `service-files-converter-mistral` enrute a `service-qdrant-by-file` (fan-out) antes de `service-setup-qdrant`. Agregar campo `fan_out_by` a la configuración del pipeline.
- Actualizar callback de jobs (`POST /api/v1/jobs/callback`) para aceptar `file_id` opcional, identificando instancias de jobs fan-out.
- Hacer campos `analysis_id`, `is_reorderable`, `is_merged` y `created_at` obligatorios (NOT NULL) en el schema de archivos.

##### Fixed
- Corregir vista `analyses_view` que no incluía las columnas `user_name` y `generated_name`, recreando la vista con los campos faltantes.
- Agregar columna `file_id` faltante a la tabla `jobs` en la base de datos.

#### [1.0.0] - 2026-03-25

##### Added
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

##### Changed
- Migrar configuración de dependencias de jobs a un modelo basado en servicios, reemplazando `jobs_tree.json` por `services_dependency.json`.
- Renombrar `job_name` a `service_name` en la orquestación de jobs.
- Renombrar endpoint de health check de base de datos para verificar explícitamente la conexión a Supabase.
- Renombrar `service-iterative-requirement-extractor` a `service-requirement-extractor`.
- Unificar configuración del pipeline en un solo archivo `pipeline_config.json`.
- Traducir nombre de display del scorer de propuestas a "Puntuación de Propuestas".

##### Fixed
- Corregir marcado de workflow step como fallido y uso correcto del estado de job en callback de fallo.
- Corregir marcado de análisis como listo (`is_success=true`) cuando el job final del pipeline completa exitosamente.

### accsa-licitaciones-services

#### [1.2.0] - 2026-03-31

##### Added
- Agregar `service-documents-classifier` para clasificar archivos de licitación usando Gemini, con categorías de pliego, normativa, propuesta y no clasificado.
- Agregar `service-file-metadata-extractor` para extracción de metadatos de archivos usando Gemini, incluyendo integración en pipeline CI/CD.
- Agregar `service-joiner` para unificar archivos Markdown en `tender_full.md` y `proposal_full.md` por análisis.
- Agregar `service-qdrant-by-file` para indexación dedicada por archivo individual en Qdrant, con integración en pipeline CI/CD y script de creación de Container App Job.
- Agregar categoría `unclassified` como fallback cuando no se puede determinar la clasificación de un documento.
- Agregar creación de registro de licitación (tender) y vinculación de archivos de pliego/normativa en `documents-clasification`.
- Agregar generación automática del nombre de análisis a partir de metadatos de la licitación.
- Agregar agrupación de archivos de propuesta por empresa con creación automática de propuestas.
- Agregar propagación de clasificación a archivos vinculados y campo `link` en `files-converter`.
- Agregar variables `API_JOBS_CALLBACK`, `API_REQUIREMENTS_PATH` y `API_TENDERS_PATH` al pipeline de Azure.
- Agregar documentación `api.md` y `summary.md` por servicio.

##### Changed
- Simplificar `service-file-extractor` eliminando la lógica de carpetas de propuestas y categorización automática; los archivos se procesan de forma plana directamente asociados al análisis.
- Simplificar `service-files-converter` eliminando lógica de propuestas, archivos combinados y merges; los archivos convertidos se asocian directamente al análisis sin categoría.
- Migrar `service-files-converter` de `llama-parse` a SDK `llama_cloud`, utilizando el tier agentic de parsing con soporte OCR en español.
- Modificar `chunk-and-index` para procesar un archivo individual por `FILE_ID` en lugar de todos los archivos del análisis.

##### Fixed
- Corregir clasificación de documentos para requerir `company_name` explícito antes de clasificar como propuesta, con fallback a `unclassified`.
- Corregir retry con backoff exponencial para errores transitorios de Gemini en `file-metadata-extractor`.
- Corregir manejo de respuestas de Gemini en formato JSON array en `file-metadata-extractor`.
- Corregir doble barra en URL de descarga de artifacts.
- Corregir variable `API_TENDERS_PATH` faltante en script `build-and-push.sh`.

#### [0.9.0] - 2026-02-23

##### Added
- Agregar `service-proposal-scorer` para puntuación automatizada de propuestas, incluyendo integración en pipeline CI/CD y script de creación de Container App Job.
- Agregar estado `unprocessable` al servicio `verify-compliance` para manejar archivos que no pueden ser procesados.
- Agregar `service-metadata-extractor` para extracción de metadatos de proveedores, incluyendo nueva columna `provider_metadata` en base de datos.
- Agregar mecanismo de retry con backoff exponencial en todos los servicios para mayor resiliencia ante fallos transitorios.
- Agregar validación de formato de rutas API en todos los Dockerfiles durante el build.

##### Changed
- Migrar de OpenAI a Gemini como LLM principal en los servicios de procesamiento.
- Refactorizar `verify-compliance` para procesar todas las propuestas de un análisis en una sola ejecución de job.
- Renombrar `service-iterative-requirement-extractor` a `service-requirement-extractor`.
- Actualizar servicios `chunk-and-index`, `requirement-extractor` y `verify-compliance` al patrón canónico del proyecto y habilitarlos en el pipeline.
- Actualizar `service-setup-qdrant` al patrón canónico y habilitarlo en el pipeline.

##### Fixed
- Corregir callback de éxito en `requirement-extractor` cuando no se encuentran chunks relevantes.
- Corregir payload de estado en `notify_failure` en todos los servicios.
- Corregir migración del SDK `google-generativeai` (deprecado) al nuevo SDK `google-genai`.
- Corregir propagación de errores en callbacks que se estaban silenciando.

#### [0.8.0] - 2026-02-21

##### Added
- Agregar funcionalidad de callback de jobs para reportar estado de finalización de servicios al backend.
- Habilitar `service-files-converter` en el pipeline de Azure.
- Agregar variables de entorno para artifacts de Supabase, Google API y rutas de API configurables.
- Migrar logging de eventos para usar la API del backend en lugar de interacción directa con Supabase.

##### Changed
- Consolidar scripts de build y push en un único punto de entrada configurable (`build-and-push.sh` con modos `local`/`azure`).
- Renombrar `SUPABASE_SERVICE_ROLE_KEY` a `SUPABASE_SERVICE_KEY` en todos los servicios y configuraciones.
- Eliminar funcionalidad de logging de pasos de workflow y configuraciones asociadas.
- Consolidar creación de Azure Container App Jobs en un único script centralizado.

#### [0.7.0] - 2026-02-20

##### Added
- Agregar configuración inicial de Azure Pipelines con estrategia matrix para build paralelo de servicios.
- Agregar validación en tiempo de build de variables de entorno requeridas en los Dockerfiles.
- Implementar logging de pasos de workflow con utilidad `log_workflow_step` y plantillas JSON.
- Implementar estrategia de build condicional para compilar solo servicios modificados.

##### Changed
- Estandarizar nombres de imágenes y variables de registro en scripts de build y deploy.
- Separar validaciones de build args en comandos RUN individuales en Dockerfiles para mejor claridad y caching.
- Separar scripts de build en versiones locales y Azure por servicio.

##### Fixed
- Corregir uso de `REGISTRY_NAME` explícito para obtención de credenciales ACR en script de creación de jobs.

#### [0.6.0] - 2026-02-18

##### Added
- Agregar `service-verify-compliance` para auditoría de propuestas con IA, incluyendo búsqueda semántica en Qdrant, reranking con Cohere y evaluación con GPT-4.
- Agregar logging de eventos para completado de extracción de archivos e inicio de configuración de Qdrant.

#### [0.5.0] - 2026-02-16

##### Added
- Agregar `service-setup-qdrant` para creación y configuración de colecciones vectoriales en Qdrant.
- Agregar `service-files-converter` para conversión de PDFs a Markdown mediante LlamaParse.
- Implementar logger compartido `supabase_logger.py` con funciones `setup_logger()`, `log_event()` y `mark_failed()`.
- Estandarizar carga de variables de entorno desde `.env.local` para desarrollo local.

#### [0.1.0] - 2026-02-14

##### Added
- Agregar `service-file-extractor` como primer servicio del proyecto, para descarga y extracción de archivos ZIP desde la API de licitaciones.
- Establecer estrategia de despliegue con Azure Container Apps Jobs, incluyendo scripts de build, push y creación de jobs.
- Agregar documentación inicial de infraestructura y despliegue.
