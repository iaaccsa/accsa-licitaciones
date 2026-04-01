# Frontend API Reference

## Tender Evaluation Types

### Obtener tipo de evaluación por label

```
GET /api/v1/tender-evaluation-types/by-label/{label}
```

**Headers requeridos:**
```
X-API-Key: <BACKEND_API_KEY>
```

**Path params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `label` | string | Label exacto del tipo de evaluación |

**Respuesta exitosa `200 OK`:**
```json
{
  "id": 1,
  "label": "string",
  "title": "string",
  "description": "string",
  "example": "string",
  "icon": "string",
  "color_badge": "string",
  "background_color": "string",
  "extraction_complexity": "string",
  "requires_additional_document": true,
  "typical_factors": ["string"],
  "frequent_organizations": ["string"],
  "observed_frequency": 0,
  "main_formula": "string | null",
  "key_signals": ["string"],
  "notes": ["string"]
}
```

**Respuesta de error `404`:** no existe ningún tipo de evaluación con ese `label`.

---

### Campos del modelo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | int | ID único del tipo de evaluación |
| `label` | string | Identificador textual único (clave de búsqueda) |
| `title` | string | Nombre legible del tipo |
| `description` | string | Descripción del tipo de evaluación |
| `example` | string | Ejemplo de licitación con este tipo |
| `icon` | string | Nombre o código del ícono a mostrar |
| `color_badge` | string | Color del badge (ej: `"#FF5733"` o nombre CSS) |
| `background_color` | string | Color de fondo para la tarjeta/sección |
| `extraction_complexity` | string | Complejidad de extracción (ej: `"low"`, `"medium"`, `"high"`) |
| `requires_additional_document` | boolean | Si requiere documentación adicional |
| `typical_factors` | string[] | Factores típicos asociados |
| `frequent_organizations` | string[] | Organizaciones que suelen usar este tipo |
| `observed_frequency` | int | Frecuencia observada (valor relativo) |
| `main_formula` | string \| null | Fórmula principal si aplica |
| `key_signals` | string[] | Señales clave para identificar este tipo |
| `notes` | string[] | Notas adicionales |

---

### Ejemplo de uso (fetch)

```js
const res = await fetch(`/api/v1/tender-evaluation-types/by-label/${label}`, {
  headers: { 'X-API-Key': API_KEY }
});

if (res.status === 404) {
  // tipo de evaluación no encontrado
}

const data = await res.json();
```
