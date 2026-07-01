# Frontend — Revisión técnica y de seguridad

**Proyecto:** `accsa-licitaciones-ui`
**Stack:** Next.js 16.2.6 (App Router) · React 19.2 · TypeScript (strict) · Tailwind v4 · shadcn/ui · Supabase SSR
**Fecha:** 2026-06-25
**Alcance:** estructura, bugs, rendimiento, calidad de código y seguridad del frontend (no incluye API ni services).
**Método:** lectura de las 52 rutas `src/app/api/**`, capa de auth (`src/lib/supabase/**`, `src/proxy.ts`), flujo de upload, configuración (`next.config.ts`, `tsconfig.json`, ESLint), `pnpm lint` y barridos de anti-patrones.

---

## Resumen ejecutivo

La base es **sólida**: patrón proxy server-side consistente, la API key del backend nunca llega al browser, control de acceso por análisis (`requireAnalysisAccess`) y por entidad (`requireEntityAnalysisAccess`) aplicado en casi todas las rutas, rutas admin con doble verificación (`requireAdmin` además del middleware), validación de body con Zod, UUID validados, y cabeceras de seguridad (CSP, HSTS, X-Frame-Options) en `next.config.ts`. La versión de Next (16.2.6) está parcheada contra CVE-2025-29927.

Lo que requiere atención, por orden de prioridad:

| # | Hallazgo | Categoría | Severidad |
|---|----------|-----------|-----------|
| S1 | Upload directo a Supabase Storage con anon key pública desde el browser | Seguridad | **Media** (Alta si el bucket permite `anon`) |
| B1 | ESLint analiza `public/vendor/*.min.js` → 1500 de 1549 problemas; `pnpm lint` falla | Bug / CI | **Alta** ✅ **HECHO** |
| S2 | IDOR en `docs-chat/history`: sin verificación de propiedad de `conversation_id` | Seguridad | Media |
| S3 | Open redirect potencial vía `?next=` en login | Seguridad | Baja |
| S4 | `GET /api/analyses?job_id=` sin scoping de propietario | Seguridad | Baja |
| H1 | Archivos basura/debug versionados (`debug-webhook.ts`, `phases.*`, PNGs) | Higiene | Baja |
| P1-P3 | Sobre-uso de Client Components, fetch en `useEffect`, polling sin pausa en tab oculto | Rendimiento | Media |
| Q4/Q5 | Acceso inconsistente a env (3 rutas saltan `getEnv()`); anon key fuera del schema | Calidad | Baja |

---

## 1. Seguridad

### S1 — Upload directo a Storage con anon key pública (Media; verificar RLS)

**Ubicación:** `src/components/UploadSection.tsx:58-71`

```js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storageResponse = await fetch(
  `${supabaseUrl}/storage/v1/object/artifacts/${fileName}`,
  { method: "POST", headers: { Authorization: `Bearer ${supabaseAnonKey}`, ... }, body: zipBlob },
);
```

El browser sube el ZIP **directamente** al bucket `artifacts` usando la anon key, que es pública (va embebida en el bundle JS). Esto implica:

1. **La seguridad depende al 100% de las políticas RLS del bucket `artifacts`.** Si el bucket permite `INSERT` al rol `anon`, cualquiera con la anon key (es decir, cualquiera) puede subir archivos arbitrarios sin autenticarse: vector de abuso de almacenamiento y de costos.
2. **Se saltan todas las validaciones server-side.** El helper `validateUploadFile` (`src/lib/api-utils.ts:40-48`, límite de 260 MB y tipos MIME permitidos) **nunca se invoca** — confirmado por grep, es código muerto porque este flujo no pasa por el servidor. El único límite real es el del componente `FileUploadZone` (cliente, evadible).
3. **El nombre del objeto lo elige el cliente** (`crypto.randomUUID()`), sin control server-side.

Además, ya existe la ruta `src/app/api/upload-token/route.ts` (pensada justo para esto) pero **no está referenciada por ningún componente** — es scaffolding sin cablear.

**Recomendación:**
- **Inmediato:** verificar en Supabase que la política RLS del bucket `artifacts` exige `authenticated` (no `anon`) y, si es posible, acota por usuario (`owner = auth.uid()`).
- **Mejor:** cablear el flujo server-side. Que `/api/upload-token` (ya protegido por sesión) devuelva una signed upload URL de corta vida y que el cliente suba a esa URL. Así se elimina la dependencia de la anon key pública para escritura y se puede validar tamaño/tipo antes de emitir el token.

---

### S2 — IDOR en historial del chatbot de documentación (Media)

**Ubicación:** `src/app/api/docs-chat/history/route.ts:10-27`

La ruta recibe cualquier `conversation_id` (UUID) y hace `GET {CHATBOT_DOCS_URL}/conversations/{id}` **sin verificar que la conversación pertenezca al usuario que llama**. La ruta hermana (`docs-chat/route.ts:26-37`) sí inyecta `user_id` server-side al crear mensajes, pero el historial no filtra por ese `user_id`.

Cualquier usuario autenticado puede leer la conversación de otro adivinando/enumerando UUIDs. La enumeración de UUIDv4 es difícil y el contenido (chat de documentación) es de baja sensibilidad, de ahí severidad Media-Baja, pero rompe el principio de aislamiento que el resto de la app respeta.

**Recomendación:** propagar el `user_id` de sesión al backend del chatbot y que éste valide propiedad, o validar propiedad en el proxy antes de reenviar.

---

### S3 — Open redirect potencial vía `?next=` (Baja)

**Ubicación:** `src/app/login/page.tsx:32-33`

```js
const next = searchParams.get("next") || "/";
router.replace(next);
```

`next` se usa sin validar. En el flujo normal el middleware (`src/lib/supabase/proxy.ts:59`) lo fija a `pathname + search` (siempre relativo), pero un enlace fabricado `/login?next=https://evil.com` puede redirigir al usuario tras autenticarse. Útil para phishing.

**Recomendación:** aceptar sólo rutas internas.

```js
function safeNext(n: string | null): string {
  if (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\")) return n;
  return "/";
}
// ...
router.replace(safeNext(searchParams.get("next")));
```

---

### S4 — `GET /api/analyses?job_id=` sin verificación a nivel de handler (Baja)

**Ubicación:** `src/app/api/analyses/route.ts:7-39`

El handler `GET` (consulta de estado de job) no llama a `getClaims()` ni acota por propietario; sólo lo protege el middleware (exige estar logueado). Cualquier usuario autenticado puede consultar el estado de cualquier `job_id`. Severidad baja (los job IDs son transitorios), pero conviene alinear con el resto de rutas que sí verifican en el handler. Nota de diseño: un handler `GET` que hace `POST` al backend es contraintuitivo.

---

### S5 — Defensa en profundidad: rutas que dependen sólo del middleware (Informativa)

`upload-token`, `tender-evaluation-types` (y `by-label/[label]`), `docs-chat/history` y el `GET` de `analyses` confían únicamente en el middleware (`src/proxy.ts`) para la autenticación. Con Next 16.2.6 el bypass de `x-middleware-subrequest` (CVE-2025-29927) está parcheado, así que es aceptable, pero añadir un `getClaims()` ligero en esos handlers los haría robustos ante un futuro fallo del middleware. La mayoría de rutas ya lo hacen — son la excepción.

---

### S6 — CSP permisiva (Baja, hardening)

**Ubicación:** `next.config.ts:12-22`

- `script-src` incluye `'unsafe-inline'` y `'unsafe-eval'` → debilita la protección anti-XSS.
- `connect-src 'self' https: ...` permite conexiones a **cualquier** origen HTTPS; el `${apiBaseUrl}` explícito es redundante frente a `https:`.
- `img-src 'self' data: https:` igualmente amplio.

`'unsafe-eval'` probablemente lo exige alguna dependencia (y `vis-network` en el iframe de `/nerd-graph`). **Recomendación:** evaluar CSP basada en `nonce` para scripts en producción y acotar `connect-src` al backend en lugar de `https:` genérico. Documentar por qué se necesita `unsafe-eval` si se mantiene.

---

## 2. Bugs y correctitud

### B1 — ESLint analiza un vendor minificado → `pnpm lint` falla (Alta, trivial) — ✅ HECHO (2026-06-25)

`pnpm lint` reportaba **1549 problemas (139 errores, 1410 warnings)**, pero **1500 provenían de `public/vendor/vis-network.min.js`** (archivo de terceros minificado). La config flat de ESLint (`eslint.config.mjs`) no ignoraba `public/`, así que un lint "rojo" en CI ocultaba los hallazgos reales.

**Fix aplicado** en `eslint.config.mjs` (se añadió `"public/**"` a `globalIgnores`):

```js
globalIgnores([
  ".next/**", "out/**", "build/**", "next-env.d.ts",
  "public/**", // no lintear assets vendorizados/minificados
]),
```

**Resultado verificado:** `pnpm lint` pasó de **1549 → 49 problemas (44 errores, 5 warnings)**; el vendor ya no aparece. Los 49 restantes son el señal real de la app, dominado por cosmética (`react/no-unescaped-entities`, ver B3) y hooks (`react-hooks/set-state-in-effect`, ver B2). `pnpm lint` sigue saliendo con código 1 por esos issues reales — abordarlos es B2/B3, no parte de B1.

### B2 — `react-hooks/set-state-in-effect` + `exhaustive-deps` + `preserve-manual-memoization` — ✅ HECHO (2026-06-26)

La regla nueva del plugin de React 19 marcaba el patrón "fetch-en-`useEffect` que hace `setState`". Resuelto migrando a **SWR** (fix de raíz elegido) + arreglos puntuales. Detalle:

**Infra:** nuevo `src/lib/swr.ts` con `fetcher` (GET) y `postFetcher` (claves tupla `[url, body]` para los endpoints POST de búsqueda); `use-proposals.ts` re-exporta `fetcher`.

**8 componentes migrados a `useSWR`** (elimina el effect y el `setState`; los polls usan `refreshInterval` con pausa automática en pestaña oculta = P3; las mutaciones usan `mutate(..., { revalidate: false })`):
- `WorkflowPhases`, `WorkflowVisualization` (countdown → `mutate()`), `analyses/[id]/page`, `admin/analyses/[id]/page` (poll + cancel/resume/refrescar), `admin/config/users` (GET + invite/rol/borrar), `admin/analyses/[id]/flow` (3 fetches; + se borró `formatDateTime` muerto, el `no-unused-vars`), `AdmissibilityMatrix` (GET + edición optimista vía `mutate`).
- `StatusCheckSection`: el `useEffect` no era fetch sino sync prop→estado; reescrito al patrón de ajuste-durante-render (sin effect).

**6 componentes complejos** (scroll infinito con `IntersectionObserver`, paginación con descubrimiento de páginas, edición inline): `ComplianceMatrix`, `requirements/page`, `admissibility/page`, `events/page`, `chunks/page`, `audit/page`. Por decisión (no se pueden verificar corriendo la app aquí), llevan `eslint-disable` **acotado y justificado** sin cambio de comportamiento; la reescritura a `useSWRInfinite` queda pendiente como esfuerzo verificable (ver P2).

**Resultado verificado:** `pnpm lint` → **0 problemas (0 errores, 0 warnings)**, `tsc --noEmit` → **0 errores**. Neto −123 líneas de boilerplate.

### B3 — `react/no-unescaped-entities` (30, cosmético) — ✅ HECHO (2026-06-25)

Texto en español con comillas/apóstrofos sin escapar en JSX, concentrado en `src/app/docs/ocr-apis/page.tsx` (24) y `src/app/terms/page.tsx` (4). Sin impacto funcional (React renderiza las entidades correctamente).

Nota: `eslint --fix` **no** puede arreglarlos — la regla `react/no-unescaped-entities` no provee fixer. **Resuelto desactivando la regla** en `eslint.config.mjs` (decisión de política: la UI en español es densa en comillas/apóstrofos y la regla es ruido):

```js
{ rules: { "react/no-unescaped-entities": "off" } },
```

**Resultado verificado:** los 30 errores desaparecen; `pnpm lint` baja de 44 → 14 errores. Los 14 restantes son B2 (`react-hooks/*`) + 1 `@typescript-eslint/no-unused-vars`.

### B4 — Código y duplicación muertos

- `validateUploadFile` (`api-utils.ts:40`) nunca se llama (ver S1).
- `isValidStoragePath` está duplicado: existe en `api-utils.ts:26` y una copia local en `src/app/analyses/[id]/files/page.tsx:38` (esta última es la que se usa). Unificar en el helper.

---

## 3. Rendimiento y Next.js

### P1 — Sobre-uso de Client Components (Media)

**33 de 51 páginas** son `"use client"`. Algunas son contenido estático que no necesita JS de cliente:
- `src/app/docs/ocr-apis/page.tsx` (860 líneas) y `src/app/docs/requirements_edges/page.tsx` son `"use client"` siendo mayormente estáticas. El resto de `/docs/*` ya son Server Components (correcto) — alinearlas.
- Las páginas de detalle con datos (`analyses/[id]/*`) hacen fetch en cliente (waterfall) en vez de Server Components con streaming.

**Recomendación:** mover páginas de sólo lectura a Server Components (menos JS al cliente, mejor TTFB/LCP). Donde se necesite interactividad, aislar la parte interactiva en un componente cliente hijo.

### P2 — Fetching manual en `useEffect` en vez de SWR (Media) — 🟡 PARCIAL (2026-06-26)

Era: 25 archivos con `useEffect` + estado manual; sólo 3 con SWR. Con B2 se migraron **8 componentes** a `useSWR` (`src/lib/swr.ts` provee `fetcher`/`postFetcher`). **Pendiente:** las 6 pantallas de lista/matriz con scroll infinito o paginación (`ComplianceMatrix`, `requirements`, `admissibility`, `events`, `chunks`, `audit`) → reescribir a **`useSWRInfinite`**. Es la parte que requiere QA en vivo (superficies core de revisión); por eso quedó fuera de B2.

### P3 — Polling sin pausa en pestaña oculta y múltiples loops por página (Baja-Media) — ✅ HECHO (vía B2)

Era: cada componente con su `setInterval` de 10 s, sin pausa en pestaña oculta. Resuelto al migrar el polling a SWR `refreshInterval`: SWR **pausa automáticamente cuando la pestaña está oculta** (`refreshWhenHidden: false` por defecto) y **dedupe** las peticiones a la misma clave entre componentes. `analyses/[id]/page` ahora poll-ea sólo mientras el estado es activo vía `refreshInterval` como función.

### P4 — Bien resuelto
- `optimizePackageImports: ["lucide-react"]` activo (`next.config.ts:40`).
- `vis-network.min.js` (686 KB) sólo se carga en el iframe de `/nerd-graph` (lazy, no afecta al bundle principal).
- Uso de `next/image` donde hay imágenes; no hay `<img>` crudos.

---

## 4. Calidad de código y tooling

- **Q1 (Alta):** ver B1 — desbloquear el lint primero, lo demás depende de eso.
- **Q4 (Baja):** acceso inconsistente a env. `src/app/api/tender-evaluation-types/route.ts`, `.../by-label/[label]/route.ts` y `.../analyses/[id]/tender-classification/route.ts` leen `process.env.API_BASE_URL` / `BACKEND_API_KEY` directamente (con fallback `apiKey || ""`), saltándose la validación Zod de `getEnv()` (`src/lib/env.ts`). Alinear con el resto usando `getEnv()`.
- **Q5 (Baja):** `NEXT_PUBLIC_SUPABASE_ANON_KEY` se usa en `UploadSection.tsx` pero **no está declarada** en el schema de `src/lib/env.ts` (que sólo valida `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Coexisten dos keys públicas (anon legacy para storage + publishable para auth). Declararla en el schema o eliminar la dependencia (ver S1).
- **Q6 (Baja):** `tsconfig.json` `target: "ES2017"`. Subir a `ES2020`+ (todos los navegadores objetivo lo soportan) reduce transpilación. Opcional: `noUncheckedIndexedAccess` para más rigor.
- **Q7 (Baja):** sin `metadataBase` ni `robots`. Al ser herramienta interna autenticada, conviene un `robots.txt`/`metadata.robots` que **prohíba indexación** (la página `/login` es pública).

---

## 5. Higiene del repositorio

- **H1:** archivos basura/debug versionados en la raíz: `debug-webhook.ts`, `phases.html`, `phases.jsx`, `status_page_grouped.png`, `status_page_list_view.png`. `debug-webhook.ts` además **contiene una URL de webhook hardcodeada** (`nekto.app/webhook/...`) y ejecuta un `fetch` al importarse. Eliminarlos del repo.
- **H2:** `/api/upload-token` es código muerto (no referenciado). Cablearlo (ver S1, preferible) o eliminarlo.
- **H3:** `.gitignore` se ignora a sí mismo (línea `.gitignore`) e incluye entradas atípicas (`openapi.json`, `TODO.md`, `front.md`). Revisar; el self-ignore puede causar que cambios al `.gitignore` pasen desapercibidos.

---

## 6. Fortalezas (no romper)

Documentado para evitar "arreglar" lo que funciona:

- Patrón proxy server-side uniforme: la `BACKEND_API_KEY` nunca se expone al browser.
- Control de acceso consistente: `requireAnalysisAccess` / `requireEntityAnalysisAccess` en prácticamente todas las rutas `analyses/[id]/*` y de entidad; admin con `requireAdmin` (defensa en profundidad sobre el middleware).
- 404 en vez de 403 para no filtrar existencia de IDs ajenos.
- Validación de body con Zod y de UUID en las rutas.
- Cabeceras de seguridad presentes; Next 16.2.6 parcheado (CVE-2025-29927).
- `getClaims()` con publishable key (verificación local de JWT, sin round-trip por request).
- `created_by` / `user_email` inyectados server-side y sobrescribiendo lo que venga del browser (`analyses/route.ts:49-50`).

---

## 7. Plan de acción priorizado

1. ~~**B1** — Ignorar `public/**` en ESLint.~~ ✅ **HECHO** (1549 → 49 problemas; vendor fuera del lint).
2. **S1** — Verificar RLS del bucket `artifacts`; planificar migración a upload con token server-side.
3. **S2** — Cerrar el IDOR de `docs-chat/history` (scoping por `user_id`).
4. **H1/H2** — Borrar `debug-webhook.ts` y demás basura; decidir sobre `upload-token`.
5. **S3, S4** — Sanitizar `next` en login; añadir verificación de sesión/propiedad en el `GET` de analyses.
6. ~~**B2** — `react-hooks/*`.~~ ✅ **HECHO** (8 componentes a SWR + disables acotados en 6; lint y tsc en 0). ~~**P3** — pausar polling en tab oculto.~~ ✅ **HECHO** (vía SWR `refreshInterval`). **P1** — mover páginas estáticas a Server Components. **P2 (resto)** — reescribir las 6 listas/matrices a `useSWRInfinite` (requiere QA en vivo).
7. ~~**B3** — `react/no-unescaped-entities`.~~ ✅ **HECHO** (regla desactivada). **Q4/Q5/Q6** — Unificar acceso a env vía `getEnv()`; declarar la anon key en el schema; subir `target`.
8. **S6** — Endurecer CSP (nonce, acotar `connect-src`) como hardening.

*Las referencias `archivo:línea` corresponden al estado del repo al 2026-06-25.*
