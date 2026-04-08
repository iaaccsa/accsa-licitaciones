# API - Guia para el Frontend

Base URL: `http://localhost:8000/api/v1`

Header requerido en todas las peticiones: `X-API-Key: <BACKEND_API_KEY>`

---

## Requirements (`/requirements`)

### Listar requisitos de un analisis

```
GET /requirements/{analysis_id}
```

Query params opcionales:

| Param       | Tipo    | Descripcion                          |
|-------------|---------|--------------------------------------|
| domain      | string  | Filtrar por dominio                  |
| role        | string  | Filtrar por rol                      |
| factor_id   | string  | Filtrar por factor mapeado           |
| is_verified | boolean | Filtrar por estado de verificacion   |
| limit       | int     | Cantidad de resultados (1-500, def. 50) |
| offset      | int     | Pagina desde (def. 0)                |

Respuesta `200`:

```json
[
  {
    "id": "uuid",
    "analysis_id": "uuid",
    "requirement_code": "REQ-001",
    "requirement_text": "...",
    "requirement_summary": "...",
    "roles": ["admisibilidad_obligatoria"],
    "mapped_factors": [],
    "domain": "tecnico",
    "weight": { "type": "none", "value": null, "formula": null, "block": null },
    "verification_method": "documento_adjunto",
    "temporal_scope": "al_momento_ofertar",
    "citations": [],
    "confidence": "alta",
    "extraction_batch_id": null,
    "notes": null,
    "is_verified": false,
    "created_at": "2026-01-01T00:00:00",
    "updated_at": "2026-01-01T00:00:00"
  }
]
```

---

### Actualizar un requisito (patch individual)

```
PATCH /requirements/{requirement_id}
```

Body (todos los campos son opcionales):

```json
{
  "roles": ["admisibilidad_obligatoria"],
  "mapped_factors": [],
  "domain": "tecnico",
  "weight": { "type": "points", "value": 10 },
  "verification_method": "documento_adjunto",
  "temporal_scope": "al_momento_ofertar",
  "is_verified": true,
  "notes": "Texto libre"
}
```

Respuesta `200`: objeto `AnalysisRequirementRead` completo.

Respuesta `404`: si el `requirement_id` no existe.

---

### Marcar todos los requisitos de un analisis como verificados / no verificados

```
PATCH /requirements/{analysis_id}/verify-all?is_verified=true
PATCH /requirements/{analysis_id}/verify-all?is_verified=false
```

Query param obligatorio:

| Param       | Tipo    | Descripcion                                   |
|-------------|---------|-----------------------------------------------|
| is_verified | boolean | `true` para verificar todos, `false` para desmarcar |

Respuesta `200`:

```json
{
  "analysis_id": "uuid",
  "updated": 42
}
```

`updated` indica cuantos registros fueron actualizados.

Respuesta `500`: si ocurre un error en la base de datos.

---

### Reemplazar todos los requisitos de un analisis (bulk replace)

```
POST /requirements/bulk
```

Body: array de requisitos. Todos deben compartir el mismo `analysis_id`.
Elimina los existentes del analisis y los reemplaza con los nuevos.

```json
[
  {
    "analysis_id": "uuid",
    "requirement_code": "REQ-001",
    "requirement_text": "El proveedor debe...",
    "roles": ["admisibilidad_obligatoria"],
    "domain": "tecnico"
  }
]
```

Respuesta `200`:

```json
{
  "analysis_id": "uuid",
  "inserted": 5,
  "deleted": 3
}
```

---

## Valores de enumerados

### `domain`
`tecnico` | `administrativo` | `legal` | `economico_financiero` | `rrhh` | `logistico` | `ambiental` | `calidad` | `seguridad` | `otro`

### `roles`
`admisibilidad_obligatoria` | `admisibilidad_subsanable` | `puntuable` | `penalizador` | `informativo` | `preferencia_legal` | `desconocido_pendiente_pliego_general`

### `verification_method`
`documento_adjunto` | `declaracion_jurada` | `certificado_externo` | `inspeccion` | `muestra` | `visita_tecnica` | `auto_verificable_desde_oferta` | `otro`

### `temporal_scope`
`al_momento_ofertar` | `previo_adjudicacion` | `durante_ejecucion` | `postventa` | `otro`

### `confidence`
`alta` | `media` | `baja` | `muy_baja`
