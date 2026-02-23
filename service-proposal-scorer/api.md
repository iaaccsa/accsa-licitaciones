# API Endpoints — service-proposal-scorer

Endpoints pendientes de implementar en el backend FastAPI.

**Base URL**: `{API_BASE_URL}/api/v1`
Todos los endpoints requieren el header `X-API-Key`.

---

## 1. Proposals con conteos de cumplimiento

**`POST /api/v1/proposals/search-with-counts`**

Retorna los proposals de un analysis incluyendo los conteos de resultados de
cumplimiento por estado (desde `proposals_view`).

**Request Body**:
```json
{
  "analysis_id": "uuid-del-analysis"
}
```

**Response** (200): Array de proposals con conteos:
```json
[
  {
    "id": "uuid-del-proposal",
    "analysis_id": "uuid-del-analysis",
    "label": "propuesta-a",
    "provider_name": "Nombre del Proveedor",
    "status": "ready",
    "is_success": true,
    "created_at": "2026-02-20T18:00:00Z",
    "compliant_count": 18,
    "non_compliant_count": 4,
    "missing_info_count": 2,
    "unprocessable_count": 1
  }
]
```

---

## 2. Compliance results por proposal

**`POST /api/v1/compliance-results/search`**

Retorna los resultados de cumplimiento de un proposal, con datos del requisito
asociado (desde `proposal_compliance_results_view`).

**Request Body**:
```json
{
  "proposal_id": "uuid-del-proposal"
}
```

**Response** (200): Array de resultados:
```json
[
  {
    "id": "uuid-del-result",
    "proposal_id": "uuid-del-proposal",
    "requirement_id": "uuid-del-requirement",
    "status": "compliant",
    "evidence_quote": "Cita textual de la propuesta",
    "reasoning": "Explicación en español",
    "suggestion": null,
    "created_at": "2026-02-20T18:00:00Z",
    "requirement_code": "REQ-001",
    "requirement_category": "Technical",
    "requirement_text": "Texto completo del requisito",
    "requirement_page_reference": "p. 12",
    "requirement_is_mandatory": true,
    "analysis_id": "uuid-del-analysis"
  }
]
```

---

## 3. Actualizar score y resumen de un proposal

**`PATCH /api/v1/proposals/{proposal_id}/score`**

Actualiza los campos `compliance_score` y `compliance_summary` de un proposal.

**Path Parameter**:
- `proposal_id` (UUID) — ID del proposal a actualizar

**Request Body**:
```json
{
  "compliance_score": 72.00,
  "compliance_summary": "Párrafo 1 en markdown...\n\nPárrafo 2 en markdown..."
}
```

Campos:
- `compliance_score` (float) — porcentaje de cumplimiento (ej: `72.00` para 72%)
- `compliance_summary` (string) — resumen en markdown de 2 párrafos generado por Gemini

**Response** (200): El objeto `Proposal` actualizado completo.
