# Frontend: tender_classifications

Guia de implementacion UI para mostrar el perfil de evaluacion de una licitacion.

---

## Endpoint

```
GET /api/v1/tender-classifications/{analysis_id}
Headers: X-API-Key: <key>
```

---

## Estructura completa de la respuesta

```jsonc
{
  "id": "uuid",
  "analysis_id": "uuid",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z",

  "system_type": "puntos",
  "confidence": "alta",

  // Fragmentos textuales del pliego que evidencian el system_type
  "evidence": [
    "FACTOR 1 (Precio): 60 puntos — se otorga el maximo a la oferta de menor precio"
  ],

  // Lista plana de nombres de factores detectados (texto libre del pliego)
  "detected_factors": ["Precio", "Antecedentes publicos", "Antecedentes privados"],

  // Por que se descartaron otros system_types candidatos
  "discarded": {
    "discarded_types": ["porcentajes", "solo_precio_exclusivo"],
    "reason": "Los factores usan 'puntos' y no '%'; hay multiples factores"
  },

  "sufficient_chunks": true,
  "additional_chunks_recommendation": null,

  "profile_warnings": [],
  "factors": [ /* ver seccion Factores */ ],
  "role_signals": { /* ver seccion Senales de rol */ },
  "enabled_roles": { /* ver seccion Roles habilitados */ }
}
```

---

## `system_type` - Estrategia de evaluacion

| Valor | Descripcion |
|---|---|
| `puntos` | Se asignan puntos numericos por cada factor |
| `porcentajes` | Los factores tienen pesos en porcentaje |
| `mixto_cualitativo_cuantitativo` | Combina factores cualitativos y cuantitativos en bloques separados |
| `solo_precio_con_AN` | Solo precio con penalizador por antecedentes negativos |
| `solo_precio_exclusivo` | Solo precio, sin otros factores |
| `precio_con_incremento_multas` | Precio ajustado por multas o incrementos |
| `delegado_pliego_general` | Evaluacion delegada a un pliego general externo |
| `indeterminado` | No se pudo determinar con certeza |

**`confidence`** puede ser `alta`, `media` o `baja`.

---

## `factors` - Factores de puntuacion instanciados

Lista de factores detectados y cuantificados para este pliego.

```jsonc
{
  "id": "precio",                  // id canonico del factor
  "label": "Evaluacion economica", // texto literal del pliego
  "weight_type": "points",         // "points" | "percent" | "formula" | "none"
  "weight_value": 60,              // numero - null si weight_type es "formula" o "none"
  "formula": "60 x (PME/PEv)",    // null si no aplica
  "block": null,                   // "cualitativo" | "cuantitativo" | null (solo para mixto)
  "is_negative": false,            // true = penalizador (resta puntos/porcentaje)
  "citations": [                   // fragmentos del pliego que respaldan este factor
    "FACTOR 1 (Precio): 60 puntos"
  ]
}
```

---

## `role_signals` - Senales de rol detectadas por el LLM

Evidencia textual encontrada en el pliego para cada rol posible. Los 6 roles siempre estan presentes como claves. Si `role_signals` es `null`, el registro no tiene esta informacion.

```jsonc
{
  "admisibilidad_obligatoria": { "detected": true,  "evidence": ["deberan presentar certificado vigente de BPS y DGI"] },
  "admisibilidad_subsanable":  { "detected": true,  "evidence": ["podra subsanarse dentro del plazo de 48 horas"] },
  "puntuable":                 { "detected": true,  "evidence": ["FACTOR 1 (Precio): 60 puntos"] },
  "penalizador":               { "detected": true,  "evidence": ["Se restaran hasta 12 puntos por antecedentes negativos"] },
  "informativo":               { "detected": true,  "evidence": ["a efectos meramente informativos"] },
  "preferencia_legal":         { "detected": false, "evidence": [] }
}
```

---

## `enabled_roles` - Roles habilitados para este pliego

Resultado final: que roles estan activos. Este es el dato principal para contextualizar la clasificacion de requerimientos.

```jsonc
{
  "admisibilidad_obligatoria": { "enabled": true,  "source": "both", "evidence": ["..."] },
  "admisibilidad_subsanable":  { "enabled": true,  "source": "both", "evidence": ["..."] },
  "puntuable":                 { "enabled": true,  "source": "both", "evidence": ["..."] },
  "penalizador":               { "enabled": true,  "source": "both", "evidence": ["..."] },
  "informativo":               { "enabled": true,  "source": "both", "evidence": ["..."] },
  "preferencia_legal":         { "enabled": false, "source": "none", "evidence": [] },
  "desconocido_pendiente_pliego_general": { "enabled": false, "source": "none", "evidence": [] }
}
```

> `desconocido_pendiente_pliego_general` solo aparece con `enabled: true` cuando `system_type` es `delegado_pliego_general`.

### Valores de `source`

| Valor | Significado |
|---|---|
| `both` | Habilitado por la estrategia y por evidencia textual |
| `strategy_default` | Habilitado por defecto segun la estrategia, sin evidencia explicita |
| `strategy_required` | Obligatorio por la estrategia |
| `strategy` | Habilitado solo por la estrategia, sin senal textual |
| `text_only_rejected` | Habia senal textual pero la estrategia no lo permite - descartado |
| `none` | No habilitado |

---

## `profile_warnings`

Lista de strings con advertencias de consistencia. Puede estar vacia. Ejemplos:

- `"penalizador es obligatorio para la estrategia pero no se detecto evidencia textual"`
- `"La suma de puntos de los factores no suma 100"`

---

## Pantalla: detalle de clasificacion

### 1. Encabezado - Estrategia de evaluacion

- Mostrar `system_type` y `confidence`.
- Badge de advertencia si `confidence` es `baja` o `system_type` es `indeterminado`.
- Banner "Analisis potencialmente incompleto" si `sufficient_chunks` es `false`, con el texto de `additional_chunks_recommendation` si existe.
- Una alerta por cada string en `profile_warnings` si la lista no esta vacia.

### 2. Tabla de factores (`factors`)

Mostrar cuando `factors` no esta vacio. Columnas: **Factor** | **Peso** | **Formula** | **Evidencia**

- **Factor**: `label`. El `id` canonico puede usarse como tooltip.
- **Peso**:
  - `points` -> "60 pts"
  - `percent` -> "60%"
  - `formula` -> mostrar `formula` en lugar del valor
  - `none` -> "-"
- Filas con `is_negative: true`: resaltar en rojo o con icono negativo.
- Si `system_type` es `mixto_cualitativo_cuantitativo`: agrupar filas por `block`.
- **Evidencia**: expandir `citations[]` como lista de fragmentos textuales.

### 3. Roles habilitados (`enabled_roles`)

Chips/tags por cada clave con `enabled: true`. Roles con `enabled: false`: no mostrar o mostrar en gris.

| Clave | Etiqueta UI |
|---|---|
| `admisibilidad_obligatoria` | Admisibilidad obligatoria |
| `admisibilidad_subsanable` | Admisibilidad subsanable |
| `puntuable` | Puntuable |
| `penalizador` | Penalizador |
| `informativo` | Informativo |
| `preferencia_legal` | Preferencia legal |
| `desconocido_pendiente_pliego_general` | Pendiente pliego general |

Tooltip en cada chip con el valor de `source` (ver tabla arriba) y la lista `evidence[]`.

### 4. Senales de rol (`role_signals`) - vista avanzada

Seccion colapsable. No mostrar si `role_signals` es `null`.

Por cada rol: icono verde/rojo segun `detected` + lista de `evidence[]` como citas textuales.

---

## Notas

- `factors`, `enabled_roles` y `profile_warnings` nunca son `null` - pueden ser arrays/objetos vacios.
- `role_signals` puede ser `null` - verificar antes de acceder a sus propiedades.
- Cuando `role_signals` no es null, los 6 roles base siempre estan presentes como claves.
- `desconocido_pendiente_pliego_general` puede o no estar presente en `enabled_roles`.
