# Info para el Frontend: Upload directo al backend

## Por qué este cambio

Las Serverless Functions de Vercel tienen un límite de payload (~4.5 MB). La solución es que el browser suba el ZIP **directamente a Supabase Storage**, y luego llame al backend con el `storage_path` resultante.

El backend usa `X-API-Key` que no puede exponerse al browser. La solución es un sistema de **upload tokens de un solo uso**: Next.js pide el token (con su API key) y lo entrega al browser, que lo usa para autenticarse en la llamada al backend.

---

## Flujo

```
1. Browser → POST /api/upload-token  (ruta de Next.js)
             Next.js → POST {API_BASE_URL}/api/v1/upload-token  (con X-API-Key)
             ← { upload_token: "tok_...", expires_in: 300 }

2. Browser → Supabase Storage  (upload directo del ZIP, con credenciales públicas de Supabase)
             ← storage_path: "{uuid}.zip"

3. Browser → POST {NEXT_PUBLIC_API_BASE_URL}/api/v1/analyses/  (directo al backend)
             Header: X-Upload-Token: tok_...
             Body (JSON): { "storage_path": "{uuid}.zip", "user_name": "..." }
             ← Analysis object
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

Crea un análisis a partir de un archivo **ya subido a Supabase Storage**.

- **Auth** (una de las dos):
  | Header | Usado por |
  |--------|-----------|
  | `X-API-Key: <key>` | Next.js / server-to-server |
  | `X-Upload-Token: tok_<...>` | Browser en upload directo |

- **Content-Type**: `application/json`
- **Request body**:
  ```json
  {
    "storage_path": "{uuid}.zip",
    "user_name": "nombre opcional"
  }
  ```
  - `storage_path` (required): path del archivo en el bucket `artifacts` de Supabase Storage (ej: `"a1b2c3d4-....zip"`)
  - `user_name` (optional): string

- **Response `200`**: objeto `Analysis` (mismo que antes)
- **Errores**:
  - `401` — no se proveyó auth válida
  - `403` — X-API-Key inválida
  - `500` — error interno

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

# Claves públicas de Supabase para que el browser pueda subir al Storage
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

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
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 1. Pedir el token a Next.js
const { upload_token } = await fetch("/api/upload-token", { method: "POST" }).then(r => r.json());

// 2. Subir el ZIP directamente a Supabase Storage
const fileName = `${crypto.randomUUID()}.zip`;
const { error } = await supabase.storage.from("artifacts").upload(fileName, zipFile, {
  contentType: "application/zip",
});
if (error) throw error;

// 3. Notificar al backend con el storage_path
const analysis = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/analyses/`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Upload-Token": upload_token,
  },
  body: JSON.stringify({ storage_path: fileName, user_name: userName || undefined }),
}).then(r => r.json());
```

### 3. Deprecar `/api/upload` (proxy actual)

El proxy existente puede eliminarse una vez que el nuevo flujo esté verificado en producción.

---

## Nota sobre permisos de Supabase Storage

Para que el browser pueda subir al bucket `artifacts` con la `anon key`, el bucket debe tener una policy de INSERT para el rol `anon` (o `authenticated`). Verificar en el dashboard de Supabase → Storage → Policies.
