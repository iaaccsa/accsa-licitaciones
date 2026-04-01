# Auditoría de Seguridad Completa - ACCSA Licitaciones UI

**Fecha**: 2026-03-31
**Versión de la aplicación**: Next.js 16.1.6, React 19.2.3
**Arquitectura**: Next.js App Router con proxy server-side hacia backend Python
**Auditor**: Revisión especializada de seguridad

---

## Resumen Ejecutivo

La aplicación tiene una base sólida de seguridad (validación de entrada, manejo seguro de errores, headers de seguridad, patrón de proxy para proteger API keys). Sin embargo, presenta **vulnerabilidades críticas** que la hacen **no apta para producción** en su estado actual: versión de Next.js con CVEs conocidos, ausencia total de autenticación/autorización, y falta de rate limiting.

Se identifican **22 hallazgos** clasificados por severidad:

| Severidad | Cantidad |
|-----------|----------|
| Critica   | 5        |
| Alta      | 5        |
| Media     | 6        |
| Baja      | 6        |

---

## SEVERIDAD CRITICA

### C1. Next.js 16.1.6 con Vulnerabilidades Conocidas (CVEs)

**Impacto**: Ejecución remota de código, denegación de servicio, fuga de código fuente
**CVSS**: Hasta 10.0

La versión actual (`16.1.6`) está afectada por múltiples CVEs descubiertos en diciembre 2025:

| CVE | Severidad | Descripción |
|-----|-----------|-------------|
| CVE-2025-66478 (React2Shell) | CVSS 10.0 | **RCE** via deserialización insegura en el protocolo RSC. Explotado activamente en producción. |
| CVE-2025-55184 | Alta | DoS por loop infinito en requests RSC crafteadas. |
| CVE-2025-55183 | Media | Fuga de código fuente compilado de Server Functions. |
| GHSA-ggv3-7p47-pfv8 | Media | HTTP request smuggling via rewrites. |
| GHSA-3x4c-7xq6-9pq8 | Media | Crecimiento ilimitado del caché de `next/image` puede agotar disco. |
| GHSA-h27x-g6w4-24gq | Media | Buffering ilimitado en postponed resume causa DoS. |
| GHSA-mq59-m269-xvcx | Media | Origin `null` puede evadir la protección CSRF de Server Actions. |

Además, el CVE-2025-29927 (CVSS 9.1, marzo 2025) demostró que el header `x-middleware-subrequest` permite evadir toda la lógica de middleware, incluyendo autenticación. Esto invalida el middleware como barrera de seguridad.

**Remediación** (urgente):
```bash
npm install next@16.2.1
```
- Actualizar a Next.js >= 16.2.1 **inmediatamente**
- Si la aplicación estuvo expuesta sin parchear desde diciembre 2025, **rotar TODOS los secretos** (`BACKEND_API_KEY`, claves de Supabase, etc.)
- Verificar logs de acceso por indicadores de compromiso

---

### C2. Sin Autenticación ni Autorización

**Impacto**: Acceso no autorizado a todos los datos y operaciones
**Ubicación**: Toda la aplicación

No existe ningún sistema de autenticación. **Toda la aplicación es pública**:

- `POST /api/upload` — Cualquiera puede subir archivos (hasta 260 MB cada uno)
- `POST /api/analyses/[id]/cancel` — Cualquiera puede cancelar análisis de otros
- `POST /api/analyses/[id]/resume` — Cualquiera puede reanudar análisis
- `POST /api/chat` — Chat sin restricción (costoso si usa LLM)
- `POST /api/cleanup` — Cualquiera puede ejecutar operaciones de limpieza
- `PATCH /api/files/[fileId]` — Cualquiera puede modificar archivos
- `GET /admin` — Panel de administración completamente abierto
- Todos los endpoints `GET` permiten enumerar análisis, propuestas, requisitos, etc.

**Remediación**:
1. Implementar autenticación con NextAuth.js v5, Clerk, o Supabase Auth
2. Crear `src/middleware.ts` con guards de autenticación (pero NO como única barrera — ver C1 sobre CVE-2025-29927)
3. Verificar sesión **dentro de cada route handler** (defense in depth)
4. Implementar roles (user, admin) y proteger `/admin` con verificación de rol
5. Proteger todos los endpoints de escritura (upload, cancel, resume, cleanup, chat)

---

### C3. Sin Rate Limiting en Ningún Endpoint

**Impacto**: Denegación de servicio, costos excesivos, abuso de recursos
**Ubicación**: Todas las API routes en `src/app/api/`

No existe limitación de tasa en ningún endpoint. Vectores de abuso:

- **Upload**: Subidas masivas de 260 MB saturando backend y storage
- **Chat**: Llamadas ilimitadas a LLM (impacto económico directo)
- **Enumeración**: Fuerza bruta de UUIDs de análisis
- **Amplificación DDoS**: El proxy multiplica el impacto hacia el backend

**Remediación**:
```
Límites recomendados por IP:
- Upload:    3 req/min,  10 req/hora
- Chat:      20 req/min, 200 req/hora
- Lectura:   60 req/min
- Admin:     10 req/min
- Cleanup:   1 req/min
```
- Implementar con `@upstash/ratelimit` + Redis (compatible con edge)
- Complementar con rate limiting a nivel de CDN/Vercel

---

### C4. Dependencias npm con Vulnerabilidades Conocidas

**Impacto**: ReDoS, DoS, prototype pollution
**Cantidad**: 6 vulnerabilidades (3 altas, 3 moderadas)

```
ALTAS:
- flatted <=3.4.1: DoS por recursión ilimitada + Prototype Pollution en parse()
- minimatch <=3.1.3: Múltiples ReDoS (wildcards, GLOBSTAR, extglobs)
- picomatch <=2.3.1: Method Injection + ReDoS via extglob quantifiers

MODERADAS:
- ajv <6.14.0: ReDoS con opción $data
- brace-expansion: DoS por secuencia zero-step
- next 16.0.0-16.1.6: Múltiples vulnerabilidades (ver C1)
```

**Remediación**:
```bash
npm audit fix           # Resuelve la mayoría
npm audit fix --force   # Para next (requiere breaking change a 16.2.x)
```

---

### C5. CSP Permite `'unsafe-eval'` y `'unsafe-inline'` en Scripts

**Impacto**: Anula la protección contra XSS que debería proveer CSP
**Ubicación**: `next.config.ts:8`

```typescript
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
```

- **`'unsafe-eval'`**: Permite `eval()`, `new Function()`, `setTimeout("string")`. Un atacante que logre inyectar contenido puede ejecutar JavaScript arbitrario.
- **`'unsafe-inline'`**: Permite `<script>` inline y event handlers `onclick="..."`. Elimina la protección principal de CSP contra XSS.

Con estas dos directivas, el CSP es prácticamente decorativo para protección contra XSS.

**Remediación**:
1. Implementar CSP basado en nonces:
   - Generar un nonce único por request en middleware
   - Usar `script-src 'self' 'nonce-{random}' https://va.vercel-scripts.com`
   - Remover `'unsafe-inline'` y `'unsafe-eval'`
2. Si no es posible nonces inmediatamente, al menos remover `'unsafe-eval'` (Next.js 16 no debería requerirlo en producción)
3. Para estilos, `'unsafe-inline'` es más difícil de eliminar (Tailwind lo requiere), pero debería migrarse a nonces eventualmente
4. **Nota**: Esto requiere que todas las páginas usen renderizado dinámico (no estático)

---

## SEVERIDAD ALTA

### A1. Middleware Inexistente — Sin Capa de Defensa en Profundidad

**Impacto**: No hay punto centralizado para aplicar políticas de seguridad
**Ubicación**: Ausencia de `src/middleware.ts`

No existe archivo de middleware. Esto significa:
- Sin redirects de autenticación
- Sin logging centralizado de requests
- Sin validación de Origin/CSRF a nivel global
- Sin rate limiting a nivel de edge

**Remediación**:
Crear `src/middleware.ts` con arquitectura de defensa en profundidad:
```
Capa 1: Middleware       → Redirects de UX, inyección de headers, logging (NO es barrera de seguridad)
Capa 2: Route Handlers   → Verificar sesión, comprobar permisos
Capa 3: Data Access Layer → Verificación final antes de acceder a datos
```

**Importante**: Post-CVE-2025-29927, el middleware NO debe ser la única barrera de autenticación. Cada route handler debe verificar la sesión independientemente.

---

### A2. Sin Protección CSRF en Route Handlers POST

**Impacto**: Acciones no autorizadas en nombre de usuarios autenticados
**Ubicación**: Todos los endpoints POST (`/api/upload`, `/api/chat`, `/api/analyses/[id]/cancel`, `/api/cleanup`, etc.)

- Los Server Actions de Next.js tienen protección CSRF automática (comparación Origin vs Host)
- Pero los **Route Handlers** (`route.ts`) **NO** tienen esta protección
- No hay validación del header `Origin` ni tokens CSRF en ningún endpoint
- El CVE GHSA-mq59-m269-xvcx (en Next.js 16.1.6) demuestra que incluso la protección CSRF nativa puede evadirse con `Origin: null`

**Remediación**:
1. Agregar validación explícita del header `Origin` en todos los Route Handlers POST
2. Rechazar requests donde `Origin` sea `null` o no coincida con el dominio de la aplicación
3. Al implementar autenticación, usar cookies `SameSite=Strict` para sesiones
4. Considerar tokens CSRF adicionales para operaciones sensibles

---

### A3. Endpoint `/api/status` Referenciado pero Inexistente

**Impacto**: Funcionalidad rota, posible error handling inseguro
**Ubicación**: `src/components/StatusCheckSection.tsx:37-38`

```tsx
const response = await fetch(
    `/api/status?job_id=${encodeURIComponent(searchJobId.trim())}`
);
```

Este endpoint no existe en `src/app/api/`. Las requests retornarán 404, y el componente podría no manejar este error correctamente.

**Remediación**:
- Implementar el endpoint faltante con las mismas validaciones que los demás (UUID validation, error handling, etc.)
- O remover el componente `StatusCheckSection` si la funcionalidad no está en uso

---

### A4. `connect-src` Excesivamente Permisivo

**Impacto**: Data exfiltration si se logra XSS
**Ubicación**: `next.config.ts:11`

```typescript
"connect-src 'self' https:"
```

La directiva `connect-src 'self' https:` permite conexiones fetch/XHR a **cualquier dominio HTTPS**. Si un atacante logra ejecutar JavaScript (facilitado por `unsafe-eval` y `unsafe-inline` — ver C5), puede exfiltrar datos a cualquier servidor externo.

**Remediación**:
```typescript
"connect-src 'self' https://va.vercel-scripts.com https://<supabase-domain>"
```
- Listar explícitamente solo los dominios necesarios: Vercel Analytics, Supabase storage, y el dominio de la API si aplica
- Nunca usar `https:` como wildcard

---

### A5. Sin Validación de Magic Bytes en Upload de Archivos

**Impacto**: Bypass de validación de tipo de archivo
**Ubicación**: `src/lib/api-utils.ts:52-60`

```typescript
export function validateUploadFile(file: Blob): string | null {
    if (file.size > MAX_UPLOAD_SIZE) {
        return "File exceeds maximum size of 260 MB";
    }
    if (file.type && !ALLOWED_ZIP_TYPES.includes(file.type)) {
        return `Invalid file type: ${file.type}`;
    }
    return null;
}
```

Problemas:
1. Solo valida `file.type` (MIME type reportado por el navegador), que es trivialmente falsificable
2. La condición `if (file.type && ...)` significa que si `file.type` es vacío, **se omite la validación** completamente
3. `application/octet-stream` está en la lista permitida, lo cual acepta literalmente cualquier tipo de archivo
4. No se verifican los magic bytes (primeros bytes del archivo que identifican el formato real)

**Remediación**:
1. Verificar los magic bytes del archivo ZIP (`PK\x03\x04` en los primeros 4 bytes)
2. Remover `application/octet-stream` de los tipos permitidos
3. Hacer la validación de tipo obligatoria (no condicional)
4. Idealmente, descomprimir y verificar que el contenido son PDFs válidos

---

## SEVERIDAD MEDIA

### M1. Datos Sensibles Pueden Filtrarse a Client Components

**Impacto**: Exposición inadvertida de datos internos al navegador
**Ubicación**: Patrón general en la aplicación

Todas las páginas (excepto `/admin`) usan `"use client"`. Cuando un Server Component pasa props a un Client Component, esos datos se serializan en el bundle de JavaScript enviado al navegador.

Actualmente no existe una **Data Access Layer** que filtre campos antes de enviarlos al cliente. Si el backend devuelve campos internos (IDs internos, metadata, tokens), estos podrían terminar en el JavaScript del cliente.

**Remediación**:
1. Crear una Data Access Layer que retorne DTOs con solo los campos necesarios para la UI
2. Usar `import 'server-only'` en módulos que no deben importarse desde Client Components
3. Auditar las respuestas del backend para identificar campos que no deberían llegar al cliente
4. Minimizar los props pasados a componentes `"use client"`

---

### M2. HSTS Sin `preload`

**Impacto**: Primera visita vulnerable a downgrade attack
**Ubicación**: `next.config.ts:20`

```typescript
{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
```

Falta la directiva `preload` que permite incluir el dominio en la lista de preload de los navegadores, protegiendo incluso la primera visita.

**Remediación**:
```typescript
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
```
- Cambiar `max-age` a 63072000 (2 años, requisito para preload)
- Agregar `; preload`
- Registrar el dominio en https://hstspreload.org/

---

### M3. Sin Monitoreo de Violaciones de CSP

**Impacto**: Ataques XSS y violaciones de política no detectados
**Ubicación**: `next.config.ts` (CSP header)

No hay directiva `report-uri` ni `report-to` en el CSP. Las violaciones de la política (intentos de XSS, recursos bloqueados) ocurren silenciosamente sin ningún registro.

**Remediación**:
1. Agregar `report-uri https://<tu-endpoint>/csp-report` al CSP
2. O usar la API moderna: `report-to` con un grupo de reporting configurado
3. Servicios como Sentry, Report URI, o un endpoint propio pueden recibir estos reportes
4. Monitorear regularmente los reportes para detectar intentos de ataque

---

### M4. Sin Logging ni Monitoreo de Seguridad

**Impacto**: Incapacidad de detectar y responder a incidentes
**Ubicación**: Toda la aplicación

No existe:
- Logging estructurado de requests HTTP
- Registro de eventos de seguridad (intentos de acceso fallidos, validaciones rechazadas)
- Alertas de actividad anómala
- Integración con servicios de monitoreo (Sentry, DataDog, etc.)

El `safeLogError()` actual solo logea errores de backend, no actividad del usuario.

**Remediación**:
1. Implementar logging estructurado (pino, winston) con campos: timestamp, IP, path, method, status, user
2. Registrar eventos de seguridad: uploads, cancelaciones, accesos a admin, errores de validación
3. Integrar Sentry o similar para tracking de errores en producción
4. Configurar alertas para patrones anómalos (muchos 4xx desde una IP, uploads frecuentes)

---

### M5. Variables de Entorno con Errores Logeados en Detalle

**Impacto**: Fuga de configuración en logs
**Ubicación**: `src/lib/env.ts:32-33`

```typescript
const missing = z.treeifyError(result.error);
console.error("Missing or invalid environment variables:", JSON.stringify(missing, null, 2));
```

Si la validación falla, se logean los nombres de las variables faltantes/inválidas y la estructura de errores de Zod. En un entorno con logs accesibles (Vercel, CloudWatch, etc.), esto podría revelar la estructura interna de configuración.

**Remediación**:
- En producción, logear solo "Server configuration error" sin detalles
- Mantener el logging detallado solo en desarrollo
- Usar `process.env.NODE_ENV` para controlar la verbosidad

---

### M6. Sin Política de Cookies Explícita

**Impacto**: Vulnerabilidad al implementar autenticación futura
**Ubicación**: Toda la aplicación

No hay configuración explícita de cookies. Cuando se implemente autenticación, si no se configuran correctamente:
- Cookies sin `HttpOnly` → accesibles via JavaScript (robo de sesión)
- Cookies sin `Secure` → transmitidas en HTTP plano
- Cookies sin `SameSite=Strict` → vulnerables a CSRF

**Remediación** (al implementar auth):
- Configurar cookies de sesión con: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`
- `maxAge`: 24 horas para usuarios normales, 15 minutos para admin
- Rotar session ID en escalación de privilegios (login, cambio de rol)

---

## SEVERIDAD BAJA

### B1. Sin `npm audit` ni Dependabot en CI/CD

**Impacto**: Vulnerabilidades en dependencias no detectadas a tiempo

**Remediación**:
- Habilitar GitHub Dependabot en el repositorio
- Agregar `npm audit --audit-level=high` al pipeline de CI
- Usar `npm ci` en CI (no `npm install`)
- Considerar periodo de espera de 7-14 días antes de adoptar nuevas dependencias

---

### B2. Sin Protección de Supply Chain

**Impacto**: Vulnerabilidad a ataques de cadena de suministro npm

Contexto: En 2025 se produjeron ataques masivos a npm (Shai-Hulud comprometió paquetes con 2.6B de descargas semanales; PackageGate explotó zero-days en lockfiles).

**Remediación**:
- Usar `npm ci` siempre en CI/CD (respeta lockfile estrictamente)
- Habilitar `--ignore-scripts` por defecto, con allow-list explícito
- Considerar herramientas de monitoreo: Socket.dev, Snyk, o Endor Labs
- Pinear versiones exactas de dependencias críticas
- Auditar dependencias transitivas periódicamente

---

### B3. `dangerouslySetInnerHTML` en WorkflowVisualization

**Impacto**: Bajo (contenido estático hardcodeado)
**Ubicación**: `src/components/WorkflowVisualization.tsx`

```tsx
<style dangerouslySetInnerHTML={{
    __html: `
        @keyframes dash {
            to { stroke-dashoffset: -12; }
        }
    `}} />
```

El contenido es CSS estático sin input del usuario. **No es explotable** en su estado actual.

**Remediación**: Mover la animación a un archivo CSS module o a la configuración de Tailwind para eliminar el uso de `dangerouslySetInnerHTML`.

---

### B4. Error de MIME Type Revela Información

**Impacto**: Divulgación menor de información
**Ubicación**: `src/lib/api-utils.ts:58`

```typescript
return `Invalid file type: ${file.type}`;
```

El mensaje de error incluye el MIME type reportado por el usuario. Aunque menor, es mejor no reflejar input del usuario en mensajes de error.

**Remediación**:
```typescript
return "Invalid file type. Only ZIP files are accepted.";
```

---

### B5. Sin `X-Request-ID` para Trazabilidad

**Impacto**: Dificultad para correlacionar logs entre frontend y backend

**Remediación**:
- Generar un UUID por request en middleware y propagarlo como header `X-Request-ID`
- Incluir en logs del proxy y en headers de respuesta
- Facilita debugging y análisis forense de incidentes

---

### B6. Tamaño Máximo de Upload Excesivo

**Impacto**: Abuso de recursos, amplificado por la falta de rate limiting
**Ubicación**: `src/lib/api-utils.ts:44`

```typescript
const MAX_UPLOAD_SIZE = 260 * 1024 * 1024; // 260 MB
```

260 MB por upload es considerable. Sin rate limiting (C3), un atacante puede saturar rápidamente el almacenamiento y el ancho de banda.

**Remediación**:
- Evaluar si 260 MB es realmente necesario para el caso de uso (documentos de licitación)
- Si es necesario, implementar rate limiting estricto (C3) como prioridad
- Considerar límites progresivos (usuarios autenticados: 260 MB, anónimos: rechazado)

---

## Resumen de Estado Actual

### Ya Implementado (buenas prácticas)
| Control | Estado | Ubicación |
|---------|--------|-----------|
| Validación UUID en parámetros | OK | `src/lib/api-utils.ts` |
| Validación Zod en chat/history | OK | `src/app/api/chat/route.ts` |
| Validación de file upload (parcial) | OK | `src/lib/api-utils.ts` |
| Validación de user_name | OK | `src/lib/api-utils.ts` |
| Validación de pagination | OK | `src/lib/api-utils.ts` |
| Validación de storage paths | OK | `src/lib/api-utils.ts` |
| Error handling seguro | OK | `apiError()`, `safeLogError()` |
| Validación de env vars con Zod | OK | `src/lib/env.ts` |
| Headers de seguridad (parcial) | OK | `next.config.ts` |
| API key solo server-side | OK | Proxy pattern en API routes |
| Markdown rendering seguro | OK | `react-markdown` sin HTML custom |

### Pendiente por Severidad

| ID | Severidad | Hallazgo | Esfuerzo |
|----|-----------|----------|----------|
| C1 | Critica | Next.js con CVEs conocidos | 1 hora |
| C2 | Critica | Sin autenticación | 2-3 semanas |
| C3 | Critica | Sin rate limiting | 2-3 días |
| C4 | Critica | Dependencias vulnerables | 1 hora |
| C5 | Critica | CSP permite unsafe-eval/inline | 1-2 días |
| A1 | Alta | Sin middleware | 1 día |
| A2 | Alta | Sin CSRF en Route Handlers | 1 día |
| A3 | Alta | Endpoint /api/status faltante | 2 horas |
| A4 | Alta | connect-src permisivo | 1 hora |
| A5 | Alta | Sin validación de magic bytes | 3 horas |
| M1 | Media | Sin Data Access Layer | 1 semana |
| M2 | Media | HSTS sin preload | 30 min |
| M3 | Media | Sin reporting de CSP | 2 horas |
| M4 | Media | Sin logging de seguridad | 2-3 días |
| M5 | Media | Env vars logean detalles | 30 min |
| M6 | Media | Sin política de cookies | Con auth |
| B1 | Baja | Sin Dependabot/npm audit en CI | 1 hora |
| B2 | Baja | Sin protección supply chain | 2 horas |
| B3 | Baja | dangerouslySetInnerHTML estático | 30 min |
| B4 | Baja | Error revela MIME type | 15 min |
| B5 | Baja | Sin X-Request-ID | 1 hora |
| B6 | Baja | Upload 260 MB sin rate limit | Con C3 |

---

## Plan de Remediación Recomendado

### Fase 0 — Inmediata (hoy)
1. **C1**: Actualizar Next.js a >= 16.2.1
2. **C4**: Ejecutar `npm audit fix` y `npm audit fix --force`
3. **M2**: Agregar `preload` a HSTS

### Fase 1 — Semana 1
4. **C5**: Implementar CSP basado en nonces, eliminar `unsafe-eval`
5. **A4**: Restringir `connect-src` a dominios específicos
6. **A1**: Crear middleware con logging y headers
7. **A5**: Agregar validación de magic bytes en upload
8. **A3**: Resolver endpoint `/api/status` faltante
9. **B4**: Corregir mensaje de error de MIME type

### Fase 2 — Semanas 2-3
10. **C2**: Implementar autenticación (NextAuth.js/Clerk/Supabase Auth)
11. **A2**: Agregar protección CSRF en Route Handlers
12. **M6**: Configurar cookies de sesión seguras
13. **C3**: Implementar rate limiting con Upstash/Redis

### Fase 3 — Semana 4
14. **M4**: Implementar logging estructurado y monitoreo
15. **M3**: Agregar reporting de violaciones de CSP
16. **M5**: Limitar verbosidad de logs de env vars en producción
17. **M1**: Crear Data Access Layer
18. **B5**: Agregar X-Request-ID

### Continuo
19. **B1**: Configurar Dependabot y npm audit en CI
20. **B2**: Establecer política de supply chain
21. **B3**: Migrar animación CSS a module
22. **B6**: Ajustar límites de upload post-rate-limiting

---

## Referencias

- [Next.js Security Advisory: CVE-2025-66478 (React2Shell)](https://nextjs.org/blog/CVE-2025-66478)
- [Next.js Security Update December 2025](https://nextjs.org/blog/security-update-2025-12-11)
- [CVE-2025-29927: Middleware Authorization Bypass](https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass)
- [How to Think About Security in Next.js (Official)](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [Next.js Data Security Guide (Official)](https://nextjs.org/docs/app/guides/data-security)
- [Next.js CSP Guide (Official)](https://nextjs.org/docs/app/guides/content-security-policy)
- [OWASP Top 10: 2025](https://owasp.org/Top10/2025/)
- [npm Supply Chain Security Post-Shai-Hulud](https://snyk.io/articles/npm-security-best-practices-shai-hulud-attack/)
