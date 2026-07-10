# Niveles de modelo y precios (model_tiers)

> Origen: página `/docs/model-tiers` de la UI, retirada el 2026-07-09. Documento interno: contiene precios de proveedores.

Un administrador configura globalmente el **proveedor** (Gemini u OpenAI) y el **nivel de inteligencia** (bajo, medio, alto) en Admin -> Configuración LLM; cada análisis toma esa configuración al crearse. Esa combinación resuelve el modelo a usar a partir de la tabla `model_tiers`. Precios en USD por 1M de tokens (junio 2026).

| Proveedor | Nivel | Modelo | Fallback | Entrada | Salida | Cacheado | Descripción |
|---|---|---|---|---:|---:|---:|---|
| openai | Bajo | `gpt-5.4-nano` | `gemini-3.1-flash-lite` | $0.20 | $1.25 | - | Rápido y económico. |
| openai | Medio | `gpt-5.4-mini` | `gemini-3.5-flash` | $0.75 | $4.50 | - | Equilibrio velocidad/calidad. |
| openai | Alto | `gpt-5.5` | `gemini-3.1-pro` | $5.00 | $30.00 | $0.50 | Máxima capacidad. |
| gemini | Bajo | `gemini-3.1-flash-lite` | `gpt-5.4-nano` | $0.10 | $0.40 | - | Más económico, baja latencia. |
| gemini | Medio | `gemini-3.5-flash` | `gpt-5.4-mini` | $1.50 | $9.00 | $0.15 | Casi Pro a costo Flash. |
| gemini | Alto | `gemini-3.1-pro` | `gpt-5.5` | $2.00 | $12.00 | - | Razonamiento, contexto 1M. |

## Costo comparado (1M entrada + 1M salida)

| Nivel | OpenAI | Gemini | Más barato |
|---|---:|---:|---|
| Bajo | $1.45 | $0.50 | Gemini |
| Medio | $5.25 | $10.50 | OpenAI |
| Alto | $35.00 | $14.00 | Gemini |

## Notas

- El fallback es el otro proveedor en el mismo nivel (resiliencia ante caída de un proveedor).
- `gemini-3.1-pro` tiene precio por tramos (>200K de contexto: entrada 2x / salida 1.5x).
- `gpt-5.5` en modo batch/flex baja a $2.50 / $15.
- La página original anotaba "los servicios aún no consumen esta tabla; el wiring queda pendiente"; verificar contra el estado actual de la feature services-config antes de confiar en esa nota.
