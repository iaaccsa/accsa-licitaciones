# API — service-digital-signature-extractor

## Endpoints consumed

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/original-files/{file_id}` | Fetch original file record — get `storage_path`, `file_name` |
| PATCH | `/api/v1/original-files/{file_id}` | Store `digital_signatures` payload |
| POST | `/api/v1/processed-files/search` | Find processed files by `original_file_id` |
| PATCH | `/api/v1/processed-files/{file_id}` | Store `digital_signatures` on each linked processed file |
| PATCH | `/api/v1/analyses/{analysis_id}/status` | Mark analysis failed on fatal error |
| POST | `/api/v1/events/` | Log events |
| POST | `/api/v1/jobs/callback` | Notify job completion |

## Search payload

```json
POST /api/v1/processed-files/search
{ "original_file_id": "<uuid>" }
```

> Backend must support `original_file_id` filter in the processed-files search endpoint (see todo-api.md).

## Stored payload structure

```json
{
  "digital_signatures": {
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
}
```

`extraction_status` values: `success` | `no_signatures` | `failed`
