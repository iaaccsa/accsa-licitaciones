# API endpoints pendientes — service-metadata-extractor

Este servicio usa **Supabase client directo** para actualizar la tabla `proposals`,
por lo que los siguientes endpoints aún no existen en el backend FastAPI pero se
recomiendan para normalizar el acceso y permitir auditoría vía API.

---

## PATCH /api/v1/proposals/{id}

Actualiza campos de una propuesta existente.

**Path params:**
- `id` (UUID): identificador de la propuesta

**Request body** (campos opcionales, solo los enviados se actualizan):
```json
{
  "provider_name": "Empresa Ejemplo S.A.",
  "provider_metadata": {
    "company_name": "Empresa Ejemplo S.A.",
    "email": "contacto@empresa.com",
    "address": "Av. Libertador 1234, Buenos Aires",
    "phone": "+54 11 1234-5678",
    "tax_id": "30-12345678-9",
    "representative_name": "Juan Pérez",
    "additional": {}
  }
}
```

**Response** `200 OK`:
```json
{
  "id": "uuid",
  "analysis_id": "uuid",
  "label": "string",
  "provider_name": "Empresa Ejemplo S.A.",
  "provider_metadata": { ... },
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errores:**
- `404 Not Found`: propuesta no encontrada
- `422 Unprocessable Entity`: body inválido

---

## GET /api/v1/proposals/?analysis_id={analysis_id}

Lista todas las propuestas de un análisis.

**Query params:**
- `analysis_id` (UUID, requerido)

**Response** `200 OK`:
```json
[
  {
    "id": "uuid",
    "analysis_id": "uuid",
    "label": "string",
    "provider_name": "string | null",
    "provider_metadata": { ... } | null
  }
]
```

---

> **Nota:** Actualmente `service-metadata-extractor` escribe directamente vía
> `supabase.table("proposals").update(...)` como workaround hasta que estos
> endpoints existan en el backend FastAPI.
