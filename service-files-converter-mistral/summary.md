# service-files-converter-mistral

## Propósito

Convierte archivos de licitación (PDF, imágenes) a Markdown usando **Mistral OCR** (`mistral-ocr-latest`). Alternativa a `service-files-converter-llama` que usa LlamaParse.

## Flujo

1. Obtiene el slug del análisis vía API
2. Consulta archivos no procesados (`is_processed_version=false`) para el `ANALYSIS_ID`
3. Por cada archivo:
   - Descarga desde Supabase Storage
   - Sube a Mistral Files API y obtiene URL firmada
   - Ejecuta OCR con `mistral-ocr-latest`
   - Elimina el archivo de Mistral Files API (cleanup)
   - Sube el `.md` resultante a Supabase Storage
   - Crea registro de archivo via backend API
4. Notifica finalización via callback

## Servicios externos

| Servicio | Uso |
|---------|-----|
| Supabase Storage | Descarga originales, sube `.md` convertidos |
| Mistral OCR (`mistral-ocr-latest`) | Conversión PDF/imagen → Markdown |
| Backend API | Metadatos, CRUD de archivos, callbacks |

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key |
| `MISTRAL_API_KEY` | API key de Mistral |
| `API_BASE_URL` | URL base del backend |
| `API_KEY` | Clave de autenticación (`X-API-Key`) |
| `API_EVENTS_PATH` | Path de eventos |
| `API_JOBS_CALLBACK` | Path de callback |
| `ANALYSIS_ID` | UUID del análisis (runtime) |

## Diferencias vs service-files-converter-llama (LlamaParse)

- Usa `mistralai` SDK en lugar de `llama_cloud`
- Requiere `MISTRAL_API_KEY` en lugar de `LLAMA_CLOUD_API_KEY`
- Los archivos subidos a Mistral se eliminan automáticamente tras el OCR
- Sin configuración de tier ni idioma: Mistral OCR detecta idioma automáticamente
