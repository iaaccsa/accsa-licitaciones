# Resumen del extractor de requisitos (evento summary)

> Origen: página `/docs/requirement-extractor-summary` de la UI, retirada el 2026-07-09. Documento interno para debugging/soporte.

Al terminar, `service-requirement-extractor` emite un evento de resumen con métricas del procesamiento. Este documento explica cada campo de ese JSON.

## Ejemplo de salida

```json
{
  "raw_count": 215,
  "batch_count": 8,
  "failed_batches": 0,
  "failed_batch_ids": [],
  "slowest_batch_id": 7,
  "p95_batch_seconds": 84.08,
  "requirement_count": 207,
  "role_distribution": {
    "puntuable": 13,
    "informativo": 73,
    "penalizador": 1,
    "preferencia_legal": 28,
    "admisibilidad_subsanable": 9,
    "admisibilidad_obligatoria": 98
  },
  "domain_distribution": {
    "hr": 4,
    "legal": 60,
    "quality": 3,
    "financial": 28,
    "logistics": 9,
    "technical": 7,
    "administrative": 96
  },
  "validation_warnings": 14,
  "slowest_batch_seconds": 88.7,
  "gemini_fallbacks_failed": 0,
  "raw_admissibility_count": 38,
  "openai_unavailable_batches": 0,
  "gemini_fallbacks_succeeded": 0,
  "admissibility_requirement_count": 38
}
```

## Volumen de requisitos

Conteos crudos (lo que devolvió el LLM por batch) versus conteos finales (tras deduplicación y validación contra el perfil de evaluación). La diferencia es esperable: se eliminan duplicados y requisitos inválidos.

- `raw_count`: requisitos generales crudos sumando todos los batches, antes de deduplicar y validar. Incluye repeticiones entre batches solapados.
- `requirement_count`: requisitos generales finales persistidos en la tabla `requirements`, tras deduplicar y descartar inválidos. `raw_count - requirement_count` = duplicados + descartes; una caída grande puede indicar mucho solapamiento o un perfil que rechaza muchos roles.
- `raw_admissibility_count`: requisitos de admisibilidad crudos extraídos en la segunda pasada (prompt dedicado), antes de deduplicar.
- `admissibility_requirement_count`: requisitos de admisibilidad finales persistidos. Solo deduplicación, sin validación contra el perfil (la admisibilidad no usa `evaluation_profile`).

## Procesamiento por batches

Los chunks del pliego se procesan en lotes de tamaño fijo (15 chunks, con solapamiento). Estos campos miden robustez y latencia.

- `batch_count`: cantidad total de batches.
- `failed_batches`: batches que no devolvieron ningún requisito (primario y fallback fallaron, o respuesta vacía). Si la proporción supera el 5% del total, el job aborta para no guardar resultados incompletos.
- `failed_batch_ids`: IDs de los batches fallidos; lista vacía = todos produjeron resultados.
- `slowest_batch_id` / `slowest_batch_seconds`: batch más lento y su duración (peor caso individual).
- `p95_batch_seconds`: percentil 95 de duración; mejor referencia de latencia típica que el máximo porque ignora outliers.

## Fallback de modelos LLM

Cada batch se intenta primero con el modelo primario (OpenAI); si no está disponible se reintenta con Gemini. Idealmente todos en 0.

- `openai_unavailable_batches`: batches donde el primario no estuvo disponible y se gatilló el fallback.
- `gemini_fallbacks_succeeded`: batches que usaron el fallback y obtuvieron resultado.
- `gemini_fallbacks_failed`: batches donde el fallback también falló; cuentan como batch fallido en `failed_batches`.

## Calidad y clasificación

- `validation_warnings`: correcciones automáticas o descartes al validar contra el `evaluation_profile`. No son errores fatales; el detalle queda en los eventos del análisis. Se disparan al limpiar roles no habilitados, degradar roles puntuables sin factores válidos, quitar `mapped_factors` desconocidos o detectar inconsistencias de estrategia.
- `role_distribution`: conteo de requisitos generales finales por rol. Un requisito puede tener varios roles, así que la suma puede superar `requirement_count`.
- `domain_distribution`: conteo por dominio. Cada requisito tiene un único dominio, así que la suma equivale a `requirement_count`.
