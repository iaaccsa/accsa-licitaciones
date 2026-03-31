# API Orquestador de Jobs

## `POST /api/v1/jobs/start`

Inicia el pipeline de procesamiento lanzando el primer job de la cadena de dependencias.

### Request

```json
{
    "analysis_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "proposal_id": "f1e2d3c4-5678-90ab-cdef-1234567890ab"
}
```

> `proposal_id` es opcional, puede omitirse o enviarse como `null`.

### Response (200)

```json
{
    "analysis_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "started_job": "service-file-extractor",
    "message": "Pipeline iniciado. Primer job lanzado: service-file-extractor"
}
```

---

## `POST /api/v1/jobs/callback`

Recibe la notificación de que un job terminó (éxito o fallo). Si fue exitoso, lanza automáticamente los siguientes jobs en la cadena.

### Request (éxito)

```json
{
    "service_name": "service-file-extractor",
    "analysis_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "proposal_id": "f1e2d3c4-5678-90ab-cdef-1234567890ab",
    "status": "success"
}
```

### Response (200) — con siguiente job

```json
{
    "received": true,
    "next_jobs_started": ["service-files-converter-mistral"],
    "message": "Job service-file-extractor completado. Siguientes jobs lanzados: service-files-converter-mistral"
}
```

---

### Request (fallo)

```json
{
    "service_name": "service-file-extractor",
    "analysis_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "status": "failed",
    "error_message": "Container ran out of memory"
}
```

### Response (200) — pipeline detenido

```json
{
    "received": true,
    "next_jobs_started": [],
    "message": "Job service-file-extractor falló. Pipeline detenido."
}
```

---

### Request (último job exitoso)

```json
{
    "service_name": "service-generate-summary",
    "analysis_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "status": "success"
}
```

### Response (200) — pipeline finalizado

```json
{
    "received": true,
    "next_jobs_started": [],
    "message": "Job service-generate-summary completado. Pipeline finalizado."
}
```

---

## Notas

- `proposal_id` y `error_message` son campos opcionales en el callback.
- Todos los jobs reciben `ANALYSIS_ID` y `PROPOSAL_ID` como variables de entorno del container.
- El árbol de dependencias se define en `app/config/jobs_tree.json`.
