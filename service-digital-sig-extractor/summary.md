# service-digital-signature-extractor

## Proposito
Descarga el PDF original desde Supabase Storage, extrae las firmas digitales embebidas (PAdES/CAdES) y persiste la informacion en `original_files` y en todos los `processed_files` asociados via API.

## Tareas que realiza

1. Obtiene el registro del archivo original via API (storage_path, file_name)
2. Descarga el PDF desde Supabase Storage (bucket: `files`)
3. Extrae las firmas digitales embebidas usando pyhanko
4. Para cada firma: lee el certificado del firmante (nombre, organizacion, tax_id, email, emisor, tipo, vigencia)
5. Actualiza `original_files` con el campo `digital_signatures` via API (PATCH)
6. Busca todos los `processed_files` vinculados por `original_file_id`
7. Actualiza cada `processed_file` con el mismo campo `digital_signatures`
8. Notifica finalizacion via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis
- **FILE_ID** (runtime): UUID del `original_file` a procesar
- Lee: PDF desde Supabase Storage en la ruta `original_files.storage_path`

## Salida
Actualiza el campo `digital_signatures` en `original_files` y en cada `processed_file` asociado:

```json
{
  "has_signatures": true,
  "signatures": [
    {
      "signer_name": "Juan Garcia",
      "organization": "Empresa XYZ S.A.",
      "tax_id": "12345678-9",
      "email": "juan@empresa.com",
      "signing_time": "2024-01-15T10:30:00+00:00",
      "is_valid": true,
      "certificate_issuer": "CA Uruguay",
      "signature_type": "PAdES"
    }
  ],
  "extraction_status": "success",
  "extraction_error": null
}
```

`extraction_status`: `success` | `no_signatures` | `failed`

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Descarga del PDF original (bucket `files`) |
| **pyhanko** | Lectura y parseo de firmas digitales PAdES/CAdES |
| **Backend API** | Obtener archivo original, actualizar digital_signatures, buscar processed_files, callback |

## Posicion en el pipeline
Corre en paralelo con `service-file-metadata-extractor`, despues de `service-file-extractor`. No depende de Qdrant ni de conversion a Markdown.
