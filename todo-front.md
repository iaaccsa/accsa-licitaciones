# TODO Frontend: tender_classifications

Cambios que el frontend necesita implementar para mostrar el perfil de evaluacion completo de una licitacion.

---

## Que cambio en el backend

El endpoint `GET /api/v1/tender-classifications/{analysis_id}` ahora devuelve 4 campos nuevos ademas de los existentes:

| Campo nuevo | Tipo | Descripcion corta |
|---|---|---|
| `factors` | array | Factores de puntuacion con peso, formula y citas textuales |
| `role_signals` | object \| null | Evidencia textual detectada por el LLM para cada rol de requerimiento |
| `enabled_roles` | object | Roles de requerimiento habilitados para este pliego (resultado final) |
| `profile_warnings` | array de strings | Advertencias de consistencia del perfil |

Los campos existentes (`system_type`, `confidence`, `evidence`, `detected_factors`, `discarded`, `sufficient_chunks`, `additional_chunks_recommendation`) no cambian.

---

## Pantalla: detalle de clasificacion de licitacion

### 1. Encabezado - Estrategia de evaluacion

Mostrar `system_type` y `confidence` en el encabezado de la seccion.

- Si `confidence` es `baja` o `system_type` es `indeterminado`: mostrar badge de advertencia.
- Si `sufficient_chunks` es `false`: mostrar banner "Analisis potencialmente incompleto" con el texto de `additional_chunks_recommendation` si existe.
- Si `profile_warnings` no esta vacio: mostrar cada string como alerta/banner debajo del encabezado.

### 2. Tabla de factores de puntuacion (`factors`)

Mostrar cuando `factors` no esta vacio.

Columnas sugeridas: **Factor** | **Peso** | **Formula** | **Evidencia**

- **Factor**: `label` (nombre del pliego). El `id` canonico puede usarse como tooltip o identificador interno.
- **Peso**: combinar `weight_value` y `weight_type`:
  - `points` -> "60 pts"
  - `percent` -> "60%"
  - `formula` -> mostrar `formula` en lugar del valor
  - `none` -> "-"
- Filas con `is_negative: true`: resaltar en rojo o con icono negativo. El peso puede mostrarse como negativo.
- Si `system_type` es `mixto_cualitativo_cuantitativo`: agrupar filas por `block` ("Bloque Cualitativo" / "Bloque Cuantitativo").
- **Evidencia**: boton o icono que expande `citations[]` como lista de fragmentos textuales.

### 3. Roles habilitados (`enabled_roles`)

Mostrar siempre que `enabled_roles` no sea un objeto vacio.

Representar como chips/tags. Un chip por cada clave donde `enabled: true`.

Etiquetas sugeridas para cada rol:

| Clave | Etiqueta UI |
|---|---|
| `admisibilidad_obligatoria` | Admisibilidad obligatoria |
| `admisibilidad_subsanable` | Admisibilidad subsanable |
| `puntuable` | Puntuable |
| `penalizador` | Penalizador |
| `informativo` | Informativo |
| `preferencia_legal` | Preferencia legal |
| `desconocido_pendiente_pliego_general` | Pendiente pliego general |

- Roles con `enabled: false`: no mostrar o mostrar en gris/deshabilitado segun el diseno.
- Tooltip en cada chip con `source` y la lista `evidence[]`.

#### Valores de `source` para mostrar en tooltip

| `source` | Texto sugerido |
|---|---|
| `both` | Confirmado por estrategia y texto del pliego |
| `strategy_default` | Habilitado por defecto segun la estrategia |
| `strategy_required` | Requerido por la estrategia |
| `strategy` | Derivado de la estrategia |
| `text_only_rejected` | Detectado en el texto pero no aplica a esta estrategia |
| `none` | No habilitado |

### 4. Senales de rol detectadas (`role_signals`) - opcional / vista avanzada

Seccion colapsable "Ver detalle de deteccion" para usuarios avanzados.

Si `role_signals` es `null` o `{}`: no mostrar esta seccion.

Para cada rol, mostrar:
- Icono verde/rojo segun `detected`
- Lista de `evidence[]` como citas textuales

---

## Notas de implementacion

- `factors`, `enabled_roles` y `profile_warnings` siempre son arrays/objetos (nunca `null`). Pueden estar vacios.
- `role_signals` puede ser `null` - verificar antes de acceder a sus propiedades.
- Los 6 roles base siempre estan presentes como claves en `role_signals` cuando no es null. `desconocido_pendiente_pliego_general` puede o no estar presente en `enabled_roles`.
- No hay campo `profile_version` en la respuesta - el endpoint devuelve siempre el schema actual.

---

## Referencia completa de la respuesta

Ver `todo-api.md` para la estructura JSON completa con todos los tipos y ejemplos.
