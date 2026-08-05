# accsa-licitaciones-executor

Ejecutor de jobs on-prem. Reemplaza a Azure Container Apps Jobs: recibe de la
API "corre `service-xxx` para este analisis", lanza el contenedor en VM2 con un
limite de concurrencia, y devuelve un identificador de ejecucion.

Diseno completo, decisiones cerradas y plan por fases:
**`features/pending/12-ejecutor-jobs-on-prem.md`** en la raiz del monorepo.

> **Estado: FASE 1 hecha.** Lanza contenedores de verdad, con limite de
> concurrencia, watchdog, logs a disco y callback sintetico cuando un job muere
> sin poder avisar. Probado contra el Docker de VM2. Falta la FASE 2: workflow
> de CI, unidad systemd y regla de firewall.

## Contrato

Todas las rutas piden `X-API-Key: {EXECUTOR_API_KEY}`, menos `/version`.

| Ruta | Que hace |
|------|----------|
| `POST /jobs` | Encola una ejecucion. `202` con `{execution_id, execution_name, state}` |
| `GET /jobs/{execution_id}` | Estado, exit code y marcas de tiempo |
| `DELETE /jobs/{execution_id}` | Saca de la cola o mata el contenedor |
| `GET /health` | `{status, version, docker, running, queued, capacity}` |
| `GET /version` | Version unificada del sistema |

`GET /health` hace ping al daemon: `docker` vale `ok` o `unreachable`, y
`status` baja a `degraded` en el segundo caso. Es la forma rapida de detectar
que el socket no esta montado o no es accesible.

Un job que muere sin avisar (OOM, crash duro, watchdog) genera un
**callback sintetico** `status: "failed"` hacia la API, con el codigo de salida,
la ruta del log en VM2 y las ultimas lineas. Sin eso el pipeline se quedaria
colgado hasta el timeout del `JobMonitor`. Un `DELETE` **no** genera callback.

Errores: `401` sin API key valida, `400` si `service_name` no esta en la
allowlist, `404` si el `execution_id` no existe, `503` si la cola esta llena.

La API **nunca manda un nombre de imagen**: manda `service_name` y el ejecutor
deriva `{EXECUTOR_REGISTRY}/{service_name}:latest` despues de validarlo contra
`EXECUTOR_ALLOWED_SERVICES`. Esa es la mitigacion principal de correr con el
socket de Docker montado.

Los cinco campos de identidad de `POST /jobs` (`service_name`, `analysis_id`,
`proposal_id`, `file_id`, `original_file_id`) son los de `JobCallbackRequest` de
la API menos `status` y `error_message`. Se guardan tal cual para poder
devolverlos si hay que sintetizar un callback de fallo: desde el entorno del
contenedor no se puede distinguir `file_id` de `original_file_id`, porque los
dos viajan como `FILE_ID`.

## Desarrollo

```bash
cd accsa-licitaciones-executor
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # completar EXECUTOR_API_KEY
python -m app.main            # http://localhost:8080/docs
```

Comprobacion rapida:

```bash
curl -s localhost:8080/version
curl -s -H "X-API-Key: $EXECUTOR_API_KEY" localhost:8080/health
```

## Configuracion

Ver `.env.example`. Los valores que importan:

| Variable | Default | Nota |
|----------|---------|------|
| `EXECUTOR_API_KEY` | (requerida) | distinta de `BACKEND_API_KEY` |
| `EXECUTOR_ALLOWED_SERVICES` | (requerida) | los 16 nombres, separados por coma |
| `EXECUTOR_MAX_CONCURRENCY` | `3` | VM2: 4 vCPU / 6 GB, compartidos con registry y builds |
| `EXECUTOR_CPUS` / `EXECUTOR_MEMORY` | `1.0` / `1536m` | por contenedor |
| `EXECUTOR_JOB_TIMEOUT_SECONDS` | `21600` | 6h; antes 3600 (el tope que tenia Azure), subido porque files-converter-mistral convierte todos los archivos del analisis en un solo job secuencial |
| `EXECUTOR_LOG_DIR` | `/var/log/licitaciones-jobs` | bind mount desde el host |
| `EXECUTOR_HISTORY_TTL_MINUTES` | `120` | cuanto sigue consultable una ejecucion terminada |

## Despliegue

Imagen `vm2:5000/licitaciones-executor`, construida por el runner de GitHub en
VM2 y corriendo como `licitaciones-executor.service`. Los permisos de sudo para
esa unidad ya estan concedidos en `infra/scripts/harden-base.sh`. El workflow y
el script de despliegue llegan en la FASE 2.
