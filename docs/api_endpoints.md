# API Endpoints Reference

**Base URL**: `{API_BASE_URL}/api/v1`

Todos los endpoints requieren el header `x-api-key` con la API Key configurada.

---

## 1. Crear Proposal

**`POST /api/v1/proposals/`**

Crea una nueva proposal asociada a un analysis.

**Request Body** (JSON):
```json
{
  "analysis_id": "uuid-del-analysis",
  "provider_name": "Nombre del proveedor",
  "label": "etiqueta-de-la-propuesta",
  "is_success": null,
  "status": "pending",
  "audit_results": null
}
```

Campos disponibles (todos opcionales según lógica):
- `analysis_id` (UUID) — ID del analysis al que pertenece
- `provider_name` (string) — nombre del proveedor
- `label` (string) — etiqueta identificadora
- `is_success` (boolean) — si fue exitosa
- `status` (string) — estado de la proposal
- `audit_results` (object) — resultados de auditoría (JSON libre)

**Response** (200): El objeto `Proposal` creado con `id` (UUID) y `created_at` generados automáticamente.

```json
{
  "id": "generated-uuid",
  "created_at": "2026-02-20T18:00:00Z",
  "analysis_id": "uuid-del-analysis",
  "provider_name": "Nombre del proveedor",
  "label": "etiqueta-de-la-propuesta",
  "is_success": null,
  "status": "pending",
  "audit_results": null
}
```

---

## 2. Obtener Analysis por ID

**`GET /api/v1/analyses/{analysis_id}`**

Obtiene un registro de analysis por su UUID.

**Path Parameter**:
- `analysis_id` (UUID) — el ID del analysis a obtener

**Request Body**: Ninguno.

**Response** (200):
```json
{
  "id": "uuid-del-analysis",
  "created_at": "2026-02-20T18:00:00Z",
  "updated_at": "2026-02-20T18:00:00Z",
  "status": "processing",
  "slug": "slug-del-analysis",
  "artifact_path": "ruta-del-artefacto.zip",
  "is_success": null
}
```

**Response** (404): Si no se encuentra el analysis:
```json
{
  "detail": "Analysis not found"
}
```

---

## 3. Actualizar Status de un Analysis

**`PATCH /api/v1/analyses/{analysis_id}/status`**

Actualiza únicamente el campo `status` de un analysis.

**Path Parameter**:
- `analysis_id` (UUID) — el ID del analysis a actualizar

**Request Body** (JSON):
```json
{
  "status": "nuevo_valor_de_status"
}
```

Solo recibe el campo `status` (string) con el nuevo valor.

**Response** (200): El objeto `Analysis` actualizado completo:
```json
{
  "id": "uuid-del-analysis",
  "created_at": "2026-02-20T18:00:00Z",
  "updated_at": "2026-02-20T18:10:00Z",
  "status": "nuevo_valor_de_status",
  "slug": "slug-del-analysis",
  "artifact_path": "ruta-del-artefacto.zip",
  "is_success": null
}
```

---

## 4. Crear Event (log de actividad)

**`POST /api/v1/events/`**

Crea un nuevo evento/log asociado a un analysis.

**Request Body** (JSON):
```json
{
  "analysis_id": "uuid-del-analysis",
  "level": "info",
  "message": "Descripción de lo que ocurrió",
  "source": "nombre-del-servicio",
  "details": { "clave": "valor" }
}
```

Campos:
- `analysis_id` (UUID, **requerido**) — ID del analysis
- `level` (string, **requerido**) — nivel del evento (`info`, `warning`, `error`)
- `message` (string, **requerido**) — descripción del evento
- `source` (string, **requerido**) — nombre del servicio que genera el evento
- `details` (object, opcional) — datos adicionales en formato JSON libre

**Response** (200): El `Event` creado con `id` y `created_at` generados.

```json
{
  "id": "generated-uuid",
  "created_at": "2026-02-20T18:00:00Z",
  "analysis_id": "uuid-del-analysis",
  "level": "info",
  "message": "Descripción de lo que ocurrió",
  "source": "nombre-del-servicio",
  "details": { "clave": "valor" }
}
```

---

## 5. Obtener Merged Files para un Analysis

**`POST /api/v1/files/merged`**

Obtiene los files con `is_merged = true` para un analysis.

**Request Body** (JSON):
```json
{
  "analysis_id": "uuid-del-analysis"
}
```

**Response** (200): Array de objetos `File`:
```json
[
  {
    "id": "uuid-del-file",
    "created_at": "2026-02-20T18:00:00Z",
    "analysis_id": "uuid-del-analysis",
    "file_name": "documento.pdf",
    "storage_path": "slug/uuid.pdf",
    "category": "tender",
    "proposal_id": null,
    "proposal_label": null,
    "proposal_provider_name": null,
    "is_merged": true,
    "is_processed_version": false,
    "total_chunks": 15,
    "file_size": 102400,
    "mime_type": "application/pdf"
  }
]
```

---

## 6. Crear File

**`POST /api/v1/files/`**

Crea un nuevo registro de file.

**Request Body** (JSON):
```json
{
  "analysis_id": "uuid-del-analysis",
  "file_name": "documento.pdf",
  "storage_path": "slug/uuid.pdf",
  "category": "tender",
  "proposal_id": null,
  "proposal_label": null,
  "proposal_provider_name": null,
  "is_merged": false,
  "is_processed_version": false,
  "total_chunks": 0,
  "file_size": 102400,
  "mime_type": "application/pdf"
}
```

Campos disponibles (todos opcionales, enviar solo los necesarios):
- `analysis_id` (UUID) — ID del analysis al que pertenece
- `file_name` (string) — nombre original del archivo
- `storage_path` (string) — ruta en Supabase Storage
- `category` (string) — categoría del archivo (`tender`, `proposal`, `normative`)
- `proposal_id` (UUID) — ID de la proposal asociada (si aplica)
- `proposal_label` (string) — etiqueta de la proposal
- `proposal_provider_name` (string) — nombre del proveedor de la proposal
- `is_merged` (boolean) — si es un archivo mergeado
- `is_processed_version` (boolean) — si es una versión procesada
- `total_chunks` (integer) — cantidad de chunks generados
- `file_size` (integer) — tamaño del archivo en bytes
- `mime_type` (string) — tipo MIME del archivo

**Response** (200): El objeto `File` creado con `id` (UUID) y `created_at` generados automáticamente.

```json
{
  "id": "generated-uuid",
  "created_at": "2026-02-20T18:00:00Z",
  "analysis_id": "uuid-del-analysis",
  "file_name": "documento.pdf",
  "storage_path": "slug/uuid.pdf",
  "category": "tender",
  "proposal_id": null,
  "proposal_label": null,
  "proposal_provider_name": null,
  "is_merged": false,
  "is_processed_version": false,
  "total_chunks": 0,
  "file_size": 102400,
  "mime_type": "application/pdf"
}
```
