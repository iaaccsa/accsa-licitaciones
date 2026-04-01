# Frontend API Reference

## Tipos de Evaluación de Licitaciones

### `GET /api/v1/tender-evaluation-types/`

Devuelve el catálogo de sistemas de evaluación existentes. Esta tabla es estática (no se modifica desde el sistema). Útil para mostrar al usuario qué tipo de evaluación detectó el clasificador en una licitación.

**Headers requeridos:**
```
X-API-Key: <BACKEND_API_KEY>
```

**Respuesta exitosa — `200 OK`**

Array de objetos con la siguiente estructura:

```json
[
  {
    "id": 1,
    "label": "puntos",
    "title": "Sistema de Puntos",
    "description": "Las ofertas se evalúan asignando puntos numéricos...",
    "example": "ASSE — L.A. N.º 52/2024: \"FACTOR 1 (Precio): 60 puntos...\"",
    "icon": "calculator",
    "color_badge": "bg-blue-100 text-blue-800",
    "background_color": "bg-blue-50",
    "extraction_complexity": "high",
    "requires_additional_document": false,
    "typical_factors": ["Precio", "Antecedentes positivos", "Antigüedad de la empresa"],
    "frequent_organizations": ["ASSE", "UDELAR"],
    "observed_frequency": 6,
    "main_formula": "Puntaje Total = Σ(factores) − antecedentes_negativos",
    "key_signals": ["\"máximo X puntos\"", "\"FACTOR 1: 60 puntos\""],
    "notes": ["Es el tipo más frecuente en los pliegos analizados."]
  }
]
```

**Campos del objeto:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `number` | ID incremental del registro |
| `label` | `string` | Identificador corto del sistema (ej: `"puntos"`, `"porcentajes"`) |
| `title` | `string` | Nombre legible para mostrar en UI |
| `description` | `string` | Descripción completa del sistema de evaluación |
| `example` | `string` | Ejemplo real extraído de un pliego de licitación |
| `icon` | `string` | Nombre del ícono (referencia a librería de iconos, ej: Lucide) |
| `color_badge` | `string` | Clases Tailwind CSS para el badge de tipo |
| `background_color` | `string` | Clase Tailwind CSS para el fondo de la card |
| `extraction_complexity` | `string` | Complejidad de extracción: `"low"`, `"medium"` o `"high"` |
| `requires_additional_document` | `boolean` | Si el sistema requiere documentos adicionales al pliego |
| `typical_factors` | `string[]` | Factores de evaluación típicos de este sistema |
| `frequent_organizations` | `string[]` | Organismos que frecuentemente usan este sistema |
| `observed_frequency` | `number` | Cantidad de licitaciones observadas con este sistema |
| `main_formula` | `string \| null` | Fórmula principal de cálculo (puede ser `null`) |
| `key_signals` | `string[]` | Frases o patrones textuales que identifican este sistema |
| `notes` | `string[]` | Notas adicionales para el equipo o para el clasificador |

**Uso típico:**

Este endpoint se usa para:
1. Mostrar la descripción detallada del tipo de evaluación detectado en una licitación (cruzando con `system_type` del endpoint `GET /api/v1/tender-classifications/{analysis_id}`).
2. Construir un selector o panel explicativo de los distintos sistemas de evaluación.

**Relación con clasificaciones:**

El campo `label` de `TenderEvaluationType` corresponde al campo `system_type` de `TenderClassification`. Para obtener los detalles de la clasificación de un análisis:

```
GET /api/v1/tender-classifications/{analysis_id}
→ system_type: "puntos"

GET /api/v1/tender-evaluation-types/
→ buscar el objeto donde label === "puntos"
→ usar title, description, icon, color_badge, etc.
```
