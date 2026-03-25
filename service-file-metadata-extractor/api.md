# API Endpoints pendientes — service-file-metadata-extractor

## Campo nuevo requerido: `file_metadata`

### Tabla `files` (Supabase/PostgreSQL)

Agregar columna:
- **`file_metadata`** — tipo `JSONB`, nullable, default `null`

### PATCH /api/v1/files/{file_id}

El endpoint existente debe aceptar el campo `file_metadata` en el body.

**Request Body** (parcial):
```json
{
  "file_metadata": {
    "document_type": "pliego | propuesta | normativa | otro",
    "company_name": "nombre de la empresa/entidad",
    "company_role": "licitante | oferente | regulador | otro",
    "document_purpose": "descripcion breve del proposito del documento",
    "key_identifiers": {
      "tax_id": "RUT/CUIT/NIT si aparece",
      "contract_number": "numero de licitacion/contrato si aparece",
      "representative_name": "nombre del representante legal si aparece"
    },
    "summary": "resumen de 2-3 oraciones del contenido del documento"
  }
}
```

### Valores posibles

| Campo | Valores |
|-------|---------|
| `document_type` | `pliego`, `propuesta`, `normativa`, `otro` |
| `company_role` | `licitante`, `oferente`, `regulador`, `otro` |
| `key_identifiers.tax_id` | String o `null` |
| `key_identifiers.contract_number` | String o `null` |
| `key_identifiers.representative_name` | String o `null` |
