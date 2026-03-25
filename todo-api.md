# TODO API - Endpoints pendientes

## `GET /api/v1/files/{file_id}`

**Requerido por:** `service-qdrant-by-file`

| Campo | Valor |
|---|---|
| **Método** | `GET` |
| **Ruta** | `/api/v1/files/{file_id}` |
| **Path param** | `file_id: UUID` |
| **Response** | `File` (schema existente) |
| **Auth** | `APIKeyHeader` |
| **404** | Si no se encuentra el archivo |

### Implementación sugerida (FastAPI)

```python
@router.get("/{file_id}", response_model=File)
async def get_file(
    file_id: uuid.UUID,
    api_key: str = Depends(verify_api_key),
    db = Depends(get_supabase)
):
    """Get a file by ID."""
    result = db.table("files_view").select("*").eq("id", str(file_id)).maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="File not found")
    return result.data
```

> [!NOTE]
> La ruta `/api/v1/files/{file_id}` ya tiene el `PATCH`. Solo hay que agregar el `GET` al mismo router.
> Seguir el patrón de `GET /api/v1/proposals/{proposal_id}` que ya existe.
