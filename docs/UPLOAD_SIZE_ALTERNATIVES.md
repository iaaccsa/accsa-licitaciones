# Alternativas para superar el límite de payload en Vercel

## Contexto del problema

El flujo actual:
1. El cliente selecciona hasta 25 PDFs (máx. 10 MB c/u → hasta ~250 MB total)
2. `UploadSection` los comprime en un ZIP en el browser usando `jszip`
3. El ZIP se envía como `multipart/form-data` a `/api/upload` (Next.js API Route en Vercel)
4. El API Route actúa de proxy y reenvía el ZIP al backend real

**Límite de Vercel**: Las Serverless Functions tienen un límite de payload de **4.5 MB** por defecto. Aunque se puede configurar `bodySizeLimit` en Next.js App Router, el techo duro de la plataforma en el plan Pro es **~250 MB** pero **requiere streaming**, y en planes menores es mucho menor. El problema es que `request.formData()` en el route handler carga todo en memoria antes de procesarlo, lo que en la práctica falla con payloads grandes.

---

## Alternativas

### Alternativa 1: Upload directo desde el browser al backend (bypass del proxy)

**Cómo funciona**: En lugar de pasar por `/api/upload`, el browser sube el ZIP directamente al backend. Para no exponer la API key, se obtiene primero un token temporal desde un endpoint de Next.js.

```
Browser → POST /api/upload-token  →  Next.js devuelve { uploadUrl, token }
Browser → POST {uploadUrl}        →  Backend directamente con el token
```

**Implementación**:
- Nuevo endpoint GET/POST `/api/upload-token` que devuelve una URL firmada o token de un solo uso
- El backend debe tener un endpoint que acepte ese token temporal
- `UploadSection` usa esa URL para el `fetch` en lugar de `/api/upload`

**Pros**:
- Elimina completamente el cuello de botella de Vercel
- No requiere cambios en la lógica de compresión del cliente
- Escalable a cualquier tamaño

**Contras**:
- Requiere cambios en el backend (emitir tokens temporales)
- El cliente queda expuesto al CORS del backend (manejable)

**Complejidad**: Media — depende del soporte del backend para tokens de upload temporales.

---

### Alternativa 2: Upload a Supabase Storage y notificar al backend

**Cómo funciona**: El ZIP se sube primero a Supabase Storage (que ya está en uso en el proyecto), y luego se envía al backend solo la referencia (URL o path).

```
Browser → Supabase Storage (ZIP) → obtiene storage_path
Browser → POST /api/upload { storage_path } → Next.js → Backend
```

**Implementación**:
- Usar `@supabase/supabase-js` en el cliente para subir con `supabase.storage.from('bucket').upload(...)`
- El backend debe aceptar un `storage_path` en lugar del archivo binario y descargarlo él mismo
- `/api/upload` pasa a recibir solo metadata, no bytes

**Pros**:
- Supabase Storage no tiene los límites de Vercel para uploads
- El backend puede descargar el ZIP cuando quiera (desacopla el upload del procesamiento)
- Aprovecha infraestructura ya presente (`NEXT_PUBLIC_SUPABASE_STORAGE_URL` ya existe)

**Contras**:
- El ZIP queda temporalmente en Supabase (requiere limpieza posterior)
- Requiere credenciales públicas de Supabase para el upload desde el cliente
- Cambios en el contrato del API del backend

**Complejidad**: Media — Supabase SDK ya conocido, cambio en el backend necesario.

---

### Alternativa 3: Streaming del proxy en Vercel (sin buffering)

**Cómo funciona**: En lugar de leer todo el body con `request.formData()` (que lo carga en memoria), se hace streaming del cuerpo de la request directamente al backend usando `request.body` (ReadableStream).

```typescript
// En /api/upload/route.ts
export async function POST(request: NextRequest) {
    // No llamar a request.formData() — stream directo
    const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
            "X-API-Key": env.BACKEND_API_KEY,
            "Content-Type": request.headers.get("Content-Type")!,
        },
        body: request.body,  // stream sin buffering
        duplex: "half",
    });
    // ...
}
```

**Pros**:
- Cambio mínimo en el código existente
- No requiere cambios en el backend
- No expone el backend ni la API key al cliente

**Contras**:
- Vercel sigue teniendo límites de duración de ejecución (10s Hobby, 60s Pro, 300s Enterprise)
- No resuelve el límite de payload en planes bajos — Vercel puede rechazar la request antes de que llegue al handler
- Con streaming, la validación del archivo (tipo, tamaño) se pierde o se complica
- Comportamiento inconsistente según el plan de Vercel

**Complejidad**: Baja en código, pero incierta en fiabilidad según el plan.

---

### Alternativa 4: Upload en chunks desde el cliente

**Cómo funciona**: El ZIP se divide en partes de ~3 MB en el browser, cada chunk se sube individualmente a `/api/upload-chunk`, y al final se envía una señal de "completado" para que el backend ensamble.

```
Browser → POST /api/upload-chunk { chunk_id, total, data } × N
Browser → POST /api/upload-finalize { upload_id }  →  Backend ensambla
```

**Pros**:
- Cada request individual cae dentro de los límites de Vercel
- Permite retry de chunks fallidos
- Posibilita mostrar progreso real en la UI

**Contras**:
- Alta complejidad: requiere estado de ensamblaje en el backend
- Necesita persistencia temporal (Redis, DB) para los chunks intermedios
- El backend actual no parece soportarlo
- Más superficie de error (uploads parciales, timeouts entre chunks)

**Complejidad**: Alta — requiere cambios sustanciales en backend y frontend.

---

### Alternativa 5: Presigned URL de Supabase Storage con notificación webhook

**Cómo funciona**: Similar a Alternativa 2 pero el server genera la URL firmada para el upload (no se exponen credenciales al cliente).

```
Browser → GET /api/presigned-upload-url → { presignedUrl, uploadId }
Browser → PUT {presignedUrl} (ZIP binario directo a Supabase)
Browser → POST /api/upload { uploadId } → Next.js → Backend { storage_path }
```

**Pros**:
- Más seguro que Alternativa 2 (sin credenciales públicas en el cliente)
- El ZIP nunca pasa por Vercel
- Supabase Storage soporta uploads grandes sin problema

**Contras**:
- Tres round-trips en lugar de uno
- Requiere cambios en el backend y en Supabase (bucket policies)
- Gestión de URLs expiradas

**Complejidad**: Media-alta.

---

## Recomendación

### Corto plazo (menor cambio): **Alternativa 3 (streaming)**
Si el plan de Vercel es Pro o superior, probar el streaming del body sin `formData()`. Es el cambio más pequeño y no requiere tocar el backend. Pero hay que validar el comportamiento en el plan actual antes de depender de ello.

### Solución robusta recomendada: **Alternativa 1 (upload directo al backend)**
Es la más limpia arquitectónicamente: elimina la indirección innecesaria para transferencia de binarios grandes. El proxy de Next.js tiene sentido para requests pequeñas de API, pero no para transferencia de archivos pesados. Requiere coordinar con el backend para emitir tokens temporales.

### Si el backend no puede cambiar: **Alternativa 2 (Supabase Storage)**
Aprovecha infraestructura existente. El backend pasa de recibir el ZIP a recibirlo desde Supabase Storage. Es el mejor compromiso si el backend tiene restricciones de cambio.

---

## Límites de referencia en Vercel

| Plan    | Body size limit (Serverless) | Duración máxima |
|---------|------------------------------|-----------------|
| Hobby   | 4.5 MB                       | 10s             |
| Pro     | ~5 MB sin config / hasta ~4.5 MB con streaming configs | 60s  |
| Enterprise | Configurable (hasta 250 MB con streaming) | 300s |

> Fuente: Vercel docs — "Serverless Function Payload Size Limit"
