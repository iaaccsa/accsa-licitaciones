# Info para el Frontend: Upload directo al backend

## Por qué este cambio

Las Serverless Functions de Vercel tienen un límite de payload (~4.5 MB). Para subir ZIPs grandes, el browser debe subir el archivo **directamente al backend**, saltando el proxy de Next.js.

El backend usa `X-API-Key` que no puede exponerse al browser. La solución es un sistema de **upload tokens de un solo uso**: Next.js pide el token (con su API key) y lo entrega al browser, que lo usa para autenticarse en el upload directo.

---

## Flujo

```
1. Browser → POST /api/upload-token  (ruta de Next.js)
             Next.js → POST {API_BASE_URL}/api/v1/upload-token  (con X-API-Key)
             ← { upload_token: "tok_...", expires_in: 300 }

2. Browser → POST {NEXT_PUBLIC_API_BASE_URL}/api/v1/analyses/  (directo al backend)
             Header: X-Upload-Token: tok_...
             Body: multipart/form-data  { file: <zip>, user_name?: "..." }
             ← Analysis object (mismo response que antes)
```

---

## Endpoints del backend

### `POST /api/v1/upload-token`

Emite un token de un solo uso.

- **Auth**: `X-API-Key` (llamado por Next.js, no el browser)
- **Request**: body vacío
- **Response `200`**:
  ```json
  {
    "upload_token": "tok_<random>",
    "expires_in": 300
  }
  ```
- TTL: 300 segundos (5 min)
- El token se invalida en cuanto se usa exitosamente

---

### `POST /api/v1/analyses/`

Crea un análisis desde un ZIP. Ahora acepta **dos métodos de auth**:

| Header | Usado por |
|--------|-----------|
| `X-API-Key: <key>` | Next.js / server-to-server (igual que antes) |
| `X-Upload-Token: tok_<...>` | Browser en upload directo |

- **Body**: `multipart/form-data`
  - `file` (required): archivo `.zip`
  - `user_name` (optional): string
- **Response**: mismo objeto `Analysis` de siempre
- **Errores**:
  - `401` — no se proveyó auth válida
  - `403` — X-API-Key inválida
  - `400` — el archivo no es un ZIP

---

## CORS

El backend ya tiene `allow_origins: ["*"]` — no se requieren cambios de CORS.

---

## Variables de entorno necesarias en Next.js

```env
# Ya existe — URL interna del backend (usada en server-side con X-API-Key)
API_BASE_URL=https://...

# Nueva — URL pública del backend accesible desde el browser
NEXT_PUBLIC_API_BASE_URL=https://...
```

`NEXT_PUBLIC_API_BASE_URL` puede ser la misma URL que `API_BASE_URL` si el backend es públicamente accesible.

---

## Cambios requeridos en Next.js

### 1. Nueva API Route: `POST /api/upload-token`

```ts
// app/api/upload-token/route.ts
export async function POST() {
  const res = await fetch(`${process.env.API_BASE_URL}/api/v1/upload-token`, {
    method: "POST",
    headers: { "X-API-Key": process.env.BACKEND_API_KEY! },
  });
  const data = await res.json();
  return Response.json(data);
}
```

### 2. Cambio en `UploadSection.tsx` (o donde se hace el upload)

```ts
// 1. Pedir el token a Next.js
const { upload_token } = await fetch("/api/upload-token", { method: "POST" }).then(r => r.json());

// 2. Subir directamente al backend
const formData = new FormData();
formData.append("file", zipFile);
if (userName) formData.append("user_name", userName);

const analysis = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/analyses/`, {
  method: "POST",
  headers: { "X-Upload-Token": upload_token },
  body: formData,
}).then(r => r.json());
```

> **Nota**: no incluir `Content-Type` en los headers del fetch — el browser lo setea automáticamente con el boundary correcto para `multipart/form-data`.

### 3. Deprecar `/api/upload` (proxy actual)

El proxy existente puede eliminarse una vez que el nuevo flujo esté verificado en producción.
