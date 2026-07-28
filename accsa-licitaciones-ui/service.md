# Cambios en la API de archivos

## Contexto

La tabla `files` fue dividida en dos tablas separadas: `original_files` y `processed_files`. Los endpoints `/api/v1/files/*` fueron reemplazados por `/api/v1/original-files/*` y `/api/v1/processed-files/*`.

---

## service-file-extractor

Crea los registros de archivos originales extraidos del ZIP.

### Antes

```
POST /api/v1/files/
```

```json
{
  "analysis_id": "uuid",
  "file_name": "string",
  "storage_path": "string",
  "category": "tender | proposal | normative | unclassified",
  "file_size": 12345,
  "mime_type": "string",
  "is_processed_version": false
}
```

### Ahora

```
POST /api/v1/original-files/
```

```json
{
  "analysis_id": "uuid",
  "file_name": "string",
  "storage_path": "string",
  "category": "tender | proposal | normative | unclassified",
  "file_size": 12345,
  "mime_type": "string"
}
```

**Cambios:**
- Nuevo endpoint: `/api/v1/original-files/`
- Eliminar el campo `is_processed_version` (ya no existe)

---

## service-file-metadata-extractor

Lee el archivo procesado y le actualiza el campo `metadata` con la informacion extraida.

### Antes

```
GET /api/v1/files/{FILE_ID}
PATCH /api/v1/files/{FILE_ID}
```

```json
{
  "metadata": { ... }
}
```

### Ahora

```
GET /api/v1/processed-files/{FILE_ID}
PATCH /api/v1/processed-files/{FILE_ID}
```

```json
{
  "metadata": { ... }
}
```

**Cambios:**
- Nuevo endpoint base: `/api/v1/processed-files/`
- El body del PATCH no cambia
