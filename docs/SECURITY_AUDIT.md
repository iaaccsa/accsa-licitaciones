# Auditoría de Seguridad - ACCSA Licitaciones UI

**Fecha**: 2026-03-25
**Aplicación**: Next.js 16 (App Router) + React 19 + Tailwind CSS
**Arquitectura**: Proxy de API server-side hacia backend Python

---

## Resumen Ejecutivo

La aplicación implementa correctamente el patrón de proxy server-side para proteger la API key del backend. Sin embargo, carece de autenticación, autorización y rate limiting. A continuación se detallan las vulnerabilidades pendientes, organizadas por severidad.

---

## CRITICAS

### C1. Sin Autenticación ni Autorización

**Ubicación**: Toda la aplicación (páginas y API routes)

**Problema**: No existe ningún sistema de autenticación. Todos los endpoints y páginas son accesibles públicamente:
- Cualquiera puede subir archivos (`POST /api/upload`)
- Cualquiera puede ver cualquier análisis (`/analyses/[id]`)
- Cualquiera puede cancelar análisis de otros (`POST /api/analyses/[id]/cancel`)
- El panel de administración `/admin` está completamente abierto
- El chat es accesible sin restricción (`POST /api/chat`)
- Cualquiera puede ver el historial de chat (`POST /api/chat/history`)

**Impacto**: Acceso no autorizado a datos de licitaciones, manipulación de análisis, abuso de recursos.

**Remediación**:
- Implementar autenticación (NextAuth.js, Clerk, o Auth0)
- Agregar middleware de autorización en `src/middleware.ts`
- Proteger `/admin` con verificación de rol
- Proteger endpoints de escritura (upload, cancel, chat)

---

### C2. Sin Rate Limiting en Ningún Endpoint

**Ubicación**: Todas las API routes en `src/app/api/`

**Problema**: No hay limitación de tasa en ningún endpoint. Esto permite:
- Subidas masivas de archivos saturando el backend y storage
- Abuso del endpoint de chat (costoso si usa LLM)
- Enumeración de IDs de análisis por fuerza bruta
- Amplificación de DDoS a través de la capa de proxy

**Impacto**: Denegación de servicio, costos excesivos, abuso de recursos.

**Remediación**:
- Implementar rate limiting por IP (ej: `upstash/ratelimit` con Redis)
- Límites sugeridos: upload 5 req/min, chat 20 req/min, lectura 60 req/min
- Considerar rate limiting a nivel de Vercel/CDN

---

## MEDIAS

### M1. Sin Protección CSRF en Endpoints POST

**Ubicación**: Todas las rutas POST (`/api/upload`, `/api/chat`, `/api/analyses/[id]/cancel`)

**Problema**: No hay tokens CSRF ni validación de Origin. Un sitio malicioso podría hacer que un usuario autenticado (si se implementara auth en el futuro) ejecute acciones sin su consentimiento.

**Nota**: Actualmente la app no tiene auth, por lo que el impacto real es menor. Sin embargo, es importante establecer la protección antes de agregar autenticación.

**Remediación**:
- Next.js App Router con `fetch()` ya usa `SameSite=Lax` por defecto en cookies
- Agregar validación del header `Origin` en endpoints POST
- Si se implementa auth basado en cookies, agregar tokens CSRF

---

## BAJAS / MEJORES PRACTICAS

### B1. Sin `npm audit` ni Dependabot Configurado

**Problema**: No hay escaneo automático de vulnerabilidades en dependencias.

**Remediación**: Configurar Dependabot o Snyk en el repositorio, agregar `npm audit` al CI.

---

### B2. Sin Middleware de Next.js

**Problema**: No existe `src/middleware.ts`. Este archivo es el punto central para implementar auth guards, rate limiting, headers de seguridad, y logging de requests.

**Remediación**: Crear middleware con verificaciones de autenticación y headers.

---

## Tabla Resumen

| ID | Severidad | Vulnerabilidad | Estado |
|----|-----------|-----------------------------------------------|--------|
| C1 | Critica | Sin autenticación ni autorización | Pendiente |
| C2 | Critica | Sin rate limiting | Pendiente |
| M1 | Media | Sin protección CSRF | Pendiente |
| B1 | Baja | Sin escaneo de dependencias | Pendiente |
| B2 | Baja | Sin middleware de Next.js | Pendiente |

---

## Plan de Implementación Sugerido

**Fase 1 - Autenticación y Autorización**:
1. B2 - Crear middleware de Next.js
2. C1 - Implementar autenticación
3. M1 - Protección CSRF

**Fase 2 - Rate Limiting y Monitoreo**:
4. C2 - Rate limiting
5. B1 - Escaneo de dependencias

---

## Mejoras Ya Implementadas

### ~~Chat API Reenvía JSON Arbitrario al Backend~~ ✅

**Implementado**: 2026-03-26

**Problema original**: El body JSON del usuario se reenviaba íntegramente al backend sin validación ni sanitización, permitiendo mass assignment, inyección de payloads y prompt injection.

**Solución aplicada**:
- Schemas Zod estrictos en `src/app/api/chat/route.ts` y `src/app/api/chat/history/route.ts`
- Chat: valida `analysis_id` (UUID), `message` (1-10000 chars), `session_id` y `file_id` (UUID opcional)
- History: valida `analysis_id` (UUID), `session_id`/`file_id` (UUID opcional), `limit` (1-100), `offset` (≥0)
- Solo se reenvían los campos validados, nunca el body raw

---

### ~~Sin Headers de Seguridad HTTP~~ ✅

**Implementado**: 2026-03-26

**Problema original**: No se establecían headers de seguridad, dejando la app vulnerable a clickjacking, MIME sniffing y XSS.

**Solución aplicada** en `next.config.ts`:
- `Content-Security-Policy`: default-src 'self', frame-ancestors 'none', base-uri 'self', form-action 'self'
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-DNS-Prefetch-Control: on`

---

### ~~Parámetro `id` Sin Validar en URLs de API~~ ✅

**Implementado**: 2026-03-26

**Problema original**: Los parámetros `id`, `proposalId` y `fileId` se interpolaban directamente en URLs sin validación, permitiendo path traversal y null byte injection.

**Solución aplicada**:
- Helper `validateUUID()` en `src/lib/api-utils.ts` con regex UUID estricta
- Validación aplicada en todas las API routes con parámetros dinámicos: `[id]`, `[proposalId]`, `[fileId]`
- Retorna 400 inmediato si el formato no es UUID válido

---

### ~~Forwarding de Respuestas de Error del Backend~~ ✅

**Implementado**: 2026-03-26

**Problema original**: Las rutas de chat reenviaban el body de error completo del backend al cliente, exponiendo stack traces, rutas internas y detalles de DB.

**Solución aplicada**:
- Helper `apiError()` en `src/lib/api-utils.ts` retorna mensajes de error genéricos al cliente
- Helper `safeLogError()` logea solo contexto, status code y longitud del error (sin body)
- Aplicado en todas las API routes (14 archivos)

---

### ~~Sin Validación de Variables de Entorno al Inicio~~ ✅

**Implementado**: 2026-03-26

**Problema original**: Las variables de entorno se verificaban en cada request con checks manuales, sin validar formato ni fallar de forma temprana.

**Solución aplicada**:
- Módulo `src/lib/env.ts` con schema Zod que valida todas las variables requeridas
- `API_BASE_URL` validada como URL
- Resultado cacheado tras primera validación exitosa
- Todas las API routes migradas a usar `getEnv()` en vez de `process.env` directo

---

### ~~Error Handling Inconsistente en API Routes~~ ✅

**Implementado**: 2026-03-26 (resuelto como parte de Forwarding de Errores)

**Problema original**: Patrón inconsistente de manejo de errores entre rutas.

**Solución aplicada**: Helper centralizado `apiError()` y `safeLogError()` usado en todas las rutas.

---

### ~~Boilerplate Repetido en API Routes~~ ✅

**Implementado**: 2026-03-26 (resuelto como parte de Validación de Env Vars)

**Problema original**: Cada ruta repetía la verificación de env vars.

**Solución aplicada**: `getEnv()` centraliza la validación y acceso a variables de entorno con cache.

---

### ~~Logging de Información Sensible~~ ✅

**Implementado**: 2026-03-26 (resuelto como parte de Forwarding de Errores)

**Problema original**: Los errores del backend se logeaban con body completo.

**Solución aplicada**: `safeLogError()` logea solo contexto, status code y longitud del error.

---

### ~~Validación Insuficiente en Upload de Archivos~~ ✅

**Implementado**: 2026-03-26

**Problema original**: No se validaba tipo MIME, tamaño total del ZIP, ni el campo `user_name` en el servidor.

**Solución aplicada**:
- Helper `validateUploadFile()` en `src/lib/api-utils.ts`: valida MIME type (ZIP) y tamaño máximo (260 MB)
- Helper `validateUserName()` aplicado en upload route: valida longitud (200 chars) y caracteres permitidos
- Aplicado en `src/app/api/upload/route.ts`

---

### ~~URLs de Supabase Storage con Paths No Validados~~ ✅

**Implementado**: 2026-03-26

**Problema original**: `storage_path` del backend se usaba directamente en URLs de descarga sin validación, permitiendo path traversal y open redirect.

**Solución aplicada**:
- Función `isValidStoragePath()` en `src/app/analyses/[id]/files/page.tsx`: rechaza `..`, `//`, y paths con caracteres no permitidos
- Función `getDownloadUrl()` retorna `null` si el path es inválido, ocultando el botón de descarga
- Aplicado a ambas secciones de archivos (tender y proposal)

---

### ~~JSON Parse Silencioso en Routes de Paginación~~ ✅

**Implementado**: 2026-03-26

**Problema original**: `request.json().catch(() => ({}))` tragaba errores silenciosamente, ocultando bugs del cliente.

**Solución aplicada**:
- Helper `parsePaginationBody()` en `src/lib/api-utils.ts`: parsea y valida `limit` (1-100) y `offset` (≥0) con defaults seguros
- Aplicado en workflow, events y requirements routes

---

### ~~Campo `user_name` Sin Validar~~ ✅

**Implementado**: 2026-03-26

**Problema original**: Sin límite de longitud ni filtro de caracteres en cliente ni servidor.

**Solución aplicada**:
- **Server**: `validateUserName()` en `src/lib/api-utils.ts` valida longitud (max 200), caracteres unicode seguros, y trim
- **Client**: `maxLength={200}` en el input de `src/components/UploadSection.tsx`

---

### ~~Análisis GET by ID Ineficiente y con Fuga de Datos~~ ✅

**Implementado**: 2026-03-26

**Problema original**: Para obtener un análisis por ID, se descargaban TODOS los análisis y se filtraba en el proxy, transfiriendo datos innecesarios y exponiendo todos los análisis en memoria.

**Solución aplicada**:
- `src/app/api/analyses/[id]/route.ts` ahora usa el endpoint directo `GET /api/v1/analyses/{analysis_id}` del backend
- Elimina el fetch de la lista completa y el filtrado client-side
- Manejo explícito de 404 cuando el análisis no existe
