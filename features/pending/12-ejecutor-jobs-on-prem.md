# Feature 12 - Ejecutor de jobs on-prem (reemplazo de Azure Container Apps Jobs)

Complejidad: **alta** (proyecto nuevo + cambio en el corazon de la orquestacion +
infra + CI + DB). Toca los 3 proyectos existentes, agrega un cuarto, y cambia una
columna de `jobs`.

Este documento es **autocontenido**: asume que quien lo implementa no participo
de la conversacion de diseno. Las decisiones de la seccion 3 ya estan cerradas,
**no re-debatir**.

---

## 1. Objetivo

Hoy la API lanza cada paso del pipeline como un **Azure Container Apps Job**. La
migracion a on-prem (ver `infra/`) deja ese componente sin lugar: VM2 tiene
Docker, registry propio y runner de GitHub, pero nadie que reciba "corre
`service-qdrant-by-file` para este analisis".

Este feature construye ese eslabon: un **agente HTTP en VM2** que recibe
peticiones de la API, corre el contenedor y devuelve un identificador de
ejecucion, con el mismo contrato observable que tenia Azure.

Restriccion de fondo que no existia en Azure: **VM2 tiene 4 vCPU y 6 GB**, y los
comparte con el registry y con los builds del runner. Azure escalaba solo; aca
hay que encolar.

---

## 2. Estado actual (verificado)

### 2.1 Como se lanza un job hoy

`accsa-licitaciones-api/app/services/job_orchestrator_service.py`:

- `_launch_job` (390) es el **unico** punto que habla con Azure para arrancar.
  Arma `image = f"{self.registry}/{service_name}:latest"`, un `template` con un
  solo contenedor, y llama:
  ```python
  poller = self.client.jobs.begin_start(
      resource_group_name=self.resource_group,
      job_name=service_name,
      template=template,
  )
  azure_response = poller.result().as_dict()
  ```
  Es **sincrono**: espera el ack de ARM antes de seguir.
- Lo invocan `start_pipeline` (99) y `_launch_next_job` (316, 320, 324, 350).
  `retry_job` (453) y `resume_pipeline` (484) llegan por `_launch_next_job`.
- `build_service_env` (372) arma el entorno completo del job y devuelve
  `[{"name": k, "value": v}, ...]`: `ANALYSIS_ID`, `PROPOSAL_ID`, opcionalmente
  `FILE_ID`, mas `_control_plane_env()` (357: `API_BASE_URL`, `API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ARTIFACTS_BASE_URL` y los 17
  paths de `SERVICE_API_PATHS`) mas `infra_config_service.get_runtime_env()`
  (credenciales de proveedores, desde Vault). **La imagen no lleva
  configuracion**: todo se inyecta en el lanzamiento.
- `fail_timed_out_analysis` (552) es el otro punto que habla con Azure:
  `begin_stop_execution` por cada job no terminal, best-effort.

`accsa-licitaciones-api/app/core/azure.py`: el cliente se construye **en tiempo
de import** (7-22). Sin las 6 variables `AZURE_*` la API no arranca, porque en
`config.py` (23-28) estan declaradas como `str` sin default.

### 2.2 Que se guarda de cada ejecucion

`_launch_job` inserta una fila en `jobs` (436-449):

| Columna | Valor hoy |
|---|---|
| `azure_execution_id` | `azure_response["id"]` (resource id de ARM). `text NOT NULL` |
| `execution_name` | `azure_response["name"]`. `text NOT NULL` |
| `service_name`, `analysis_id` | siempre |
| `file_id`, `original_file_id`, `proposal_id` | segun el fan-out |
| `input_payload` | `{ANALYSIS_ID, PROPOSAL_ID, FILE_ID?}` |

`execution_name` es lo unico que se vuelve a leer: `fail_timed_out_analysis` lo
usa para el stop. La UI **no muestra ninguna de las dos** (solo aparecen en
`accsa-licitaciones-ui/src/lib/database.types.ts`, generado).

### 2.3 Como vuelve el resultado

El contenedor hace `POST {API_JOBS_CALLBACK}` con
`{service_name, analysis_id, proposal_id?, file_id?, original_file_id?, status, error_message?}`
(`JobCallbackRequest` en `app/schemas/job.py`), que entra por
`app/api/v1/endpoints/jobs.py` y termina en `on_job_completed` (130).

Detalle importante: en los servicios, `notify_success` / `notify_failure`
**se tragan la excepcion** si el POST falla (solo `logger.error`). Un fallo de
red en el callback deja el paso colgado hasta el timeout.

Red de seguridad actual: `JobMonitorService` (`app/services/job_monitor_service.py`)
poll cada `JOB_MONITOR_INTERVAL_SECONDS=60` y mata los analisis cuyo
`workflow_step` lleve mas de `JOB_TIMEOUT_MINUTES=65` en `running`.

### 2.4 Recursos del job en Azure hoy

`accsa-licitaciones-services/create-azure-container-app-job.sh`:

```
--replica-timeout 3600      # 60 min de tope por ejecucion
--replica-retry-limit 0     # sin reintentos
--parallelism 1
--replica-completion-count 1
--cpu 1 --memory 2Gi
```

### 2.5 Pasos con fan-out (los que generan la presion)

De `app/config/pipeline_config.json`:

| Servicio | `fan_out_by` | Instancias tipicas |
|---|---|---|
| `service-qdrant-by-file` | `processed_file` | 1 por archivo |
| `service-file-metadata-extractor` | `processed_file` | 1 por archivo |
| `service-digital-sig-extractor` | `original_file` | 1 por archivo original |
| `service-documents-classifier` | `file_with_metadata` | 1 por archivo |
| `service-build-proposal-index` | `proposal` | 1 por propuesta |
| `service-admissibility-matcher` | `proposal` | 1 por propuesta |
| `service-admissibility-gate` | `proposal` | 1 por propuesta |
| `service-compliance-matcher` / `-summarizer` / `service-economic-offer-extractor` | `proposal` (admitidas) | 1 por propuesta admitida |

Los cuatro primeros son los criticos: un pliego de 50 archivos dispara 50
lanzamientos casi simultaneos.

### 2.6 Donde mas aparece Azure

| Lugar | Que hay |
|---|---|
| `app/core/azure.py` | cliente + `verify_azure_connection()` |
| `app/core/config.py:23-28` | 6 variables `AZURE_*` **requeridas** |
| `app/api/v1/router.py:88` | `GET /health/azure` |
| `app/services/job_orchestrator_service.py` | `_launch_job`, `fail_timed_out_analysis`, `__init__` (52-54) |
| `accsa-licitaciones-api/.env.example` | bloque `# Azure` |
| `accsa-licitaciones-ui/src/app/admin/review/status/page.tsx:38` | tarjeta "Estado de Azure" |
| `accsa-licitaciones-ui/.env.example:6` | `API_HEALTH_AZURE_PATH` |
| `requirements.txt` | `azure-identity`, `azure-mgmt-appcontainers` |

### 2.7 VM2 hoy (ver `infra/vm-services.md`)

- 4 vCPU / 6 GB (5,3 GiB utiles) / `docker-lv` de 35 GB.
- Docker Engine 29.6.2, registry `registry:3` en `https://vm2:5000` con TLS y
  htpasswd, runner de GitHub self-hosted, todo en unidades systemd.
- Las 16 imagenes de servicio se etiquetan `vm2:5000/service-xxx:latest`
  (`.github/workflows/build-services.yml:96`) y se construyen **en el mismo
  daemon Docker** que va a correr los jobs.
- `infra/scripts/harden-base.sh:98-101` ya concede a `sysadmin` sudo NOPASSWD
  sobre `licitaciones-executor.service`. La unidad estaba prevista, falta crearla.
- `infra/scripts/docker-firewall.sh` filtra los puertos publicados por Docker en
  la cadena `DOCKER-USER` (ufw no los ve). Hoy cubre 5000 en VM2 y 8000 en VM1.

---

## 3. Decisiones cerradas

1. **Agente HTTP en VM2.** La API cambia solo en `_launch_job` y en el stop por
   timeout. El socket de Docker no sale de VM2 y la cola vive en un unico lugar.
2. **3 contenedores simultaneos, `--cpus 1` y `--memory 1536m` cada uno.**
   Pico de ~4,5 GB, deja aire para el SO, el registry y un build del runner.
   Los tres valores son variables de entorno del ejecutor.
3. **Flag `JOB_EXECUTOR=local|azure` en la API.** El camino de Azure queda vivo.
   Se borra en un feature aparte cuando el local lleve varios analisis reales.
4. **Proyecto nuevo `accsa-licitaciones-executor/`**, imagen Docker construida
   por el runner y publicada en el registry como el resto
   (`vm2:5000/licitaciones-executor`). Corre con `/var/run/docker.sock` montado.
5. **La API nunca elige la imagen.** Manda `service_name`; el ejecutor valida
   contra su allowlist y deriva `{EXECUTOR_REGISTRY}/{service_name}:latest`.
   Es la mitigacion principal de tener el socket montado.
6. **Sin reintentos**, igual que hoy (`--replica-retry-limit 0`). Un job que
   falla, falla.
7. **Cola FIFO en memoria.** Se pierde si el ejecutor reinicia; la red de
   seguridad es el `JobMonitor` y el `retry_job` manual. No se agrega
   persistencia hasta que haga falta.
8. **El ejecutor sintetiza el callback `failed`** cuando el contenedor sale con
   codigo distinto de 0 o lo mata el timeout. Sin esto, un OOM-kill deja el
   pipeline colgado 65 minutos, y con 1,5 GB por contenedor el OOM deja de ser
   hipotetico. Como contrapartida, `on_job_completed` se vuelve **idempotente**
   ante callbacks duplicados.
9. **Se usa el SDK de Docker (`docker` de PyPI), no `subprocess`.** El entorno
   del job lleva `OPENAI_API_KEY`, `SUPABASE_SERVICE_KEY` y demas; por linea de
   comandos quedarian visibles en el `ps` de cualquier usuario de VM2.
10. **No se hace `docker pull` en cada lanzamiento.** El runner construye en el
    mismo daemon, asi que la imagen ya esta local. Se hace pull solo si falta.
    Si algun dia el build se muda fuera de VM2, esto hay que revisarlo.
11. **Se renombra `jobs.azure_execution_id` a `jobs.execution_id`.** Con el flag
    la columna guarda un resource id de ARM o un id de ejecucion local; el
    nombre actual mentiria la mitad del tiempo. Migracion de una linea via MCP
    Supabase, y la UI no la usa.
12. **`JOB_TIMEOUT_MINUTES` sube de 65 a 150.** Ver riesgo 4.

### 3.1 Revision al cierre

Las cuatro decisiones de entrevista (1 a 4) se revisan **despues de la FASE 6**,
con datos del e2e en la mano. Que mirar en cada una:

| # | Decision | Que la confirma | Que la tumba |
|---|---|---|---|
| 1 | Agente HTTP | El alta de un fan-out grande es instantanea | Que la API tarde en aceptar N lanzamientos secuenciales; se evaluaria un alta en lote |
| 2 | 3 x 1 CPU / 1,5 GB | Cero OOM-kills y pico de RAM por contenedor holgado bajo 1,5 GB (`docker stats`) | Si ningun servicio pasa de ~800 MB, subir a 4 simultaneos. Si los extractores LLM o `files-converter-mistral` rozan el limite, bajar a 2 y subir la memoria |
| 3 | Flag `JOB_EXECUTOR` | Varios analisis reales seguidos en `local` sin intervencion | Cualquier vuelta atras a `azure` en produccion reinicia el contador |
| 4 | Imagen con el socket montado | Nada mas alla de create/start/kill/logs/rm | Si el ejecutor necesita algo mas del daemon, entra el `docker-socket-proxy` de 4.4 |

Tambien se ajustan con datos reales, no por diseno:
`JOB_TIMEOUT_MINUTES` (150 es una estimacion), `EXECUTOR_MAX_QUEUE` (200) y la
decision 7 (cola en memoria): si algun reinicio del ejecutor costo un analisis,
persistirla deja de ser sobre-ingenieria.

**La decision 3 es la que habilita la FASE 7.** El objetivo declarado es
eliminar todo el codigo de Azure una vez que el ejecutor local se pruebe en
condiciones; el flag existe solo para el periodo de transicion.

---

## 4. Diseno del ejecutor

### 4.1 Contrato HTTP

Todas las rutas piden `X-API-Key: {EXECUTOR_API_KEY}`.

```
POST /jobs
{
  "service_name": "service-qdrant-by-file",
  "analysis_id": "6f0d...",
  "proposal_id": null,
  "file_id": "a71c...",
  "original_file_id": null,
  "env": { "ANALYSIS_ID": "6f0d...", "API_BASE_URL": "...", ... }
}

202 Accepted
{
  "execution_id": "3b9f2c1e-...",
  "execution_name": "service-qdrant-by-file-3b9f2c1e",
  "state": "queued"
}
```

Los cinco campos de identidad son exactamente los de `JobCallbackRequest` menos
`status` y `error_message`: el ejecutor los guarda tal cual y los devuelve sin
interpretarlos cuando tiene que sintetizar un callback. Es la unica forma de
distinguir `file_id` de `original_file_id`, porque en el entorno del contenedor
los dos viajan como `FILE_ID` (`build_service_env` usa
`effective_file_id = file_id or original_file_id`).

```
DELETE /jobs/{execution_id}      -> 200. Saca de la cola o mata el contenedor.
GET    /jobs/{execution_id}      -> {state, exit_code, started_at, finished_at}
GET    /health                   -> {status, version, docker, running, queued, capacity}
```

`GET /jobs/{id}` no lo necesita la API; se incluye porque es lo que hace
diagnosticable el componente desde VM1.

Codigos de error: `401` sin API key, `400` si `service_name` no esta en la
allowlist, `503` si la cola supera `EXECUTOR_MAX_QUEUE` (ver riesgo 3).

### 4.2 Ciclo de vida de una ejecucion

```
queued  ->  running  ->  succeeded         (exit 0)
                     ->  failed            (exit != 0)   -> callback sintetico
                     ->  timed_out         (mata el watchdog) -> callback sintetico
        ->  stopped                        (DELETE)
```

`execution_id` es un UUID que genera el ejecutor al aceptar, **no** el id del
contenedor: tiene que existir mientras el job esta en cola, para que
`DELETE /jobs/{id}` funcione antes de que arranque. El id del contenedor se
guarda aparte.

Al terminar, en orden:

1. `docker logs` completo a `{EXECUTOR_LOG_DIR}/{execution_name}.log`.
2. `docker rm` del contenedor (se corre **sin** `--rm`, justamente para poder
   leer los logs y el exit code).
3. Libera el slot y saca el siguiente de la cola.
4. Si `exit_code != 0`: `POST {env["API_JOBS_CALLBACK"]}` con
   `status: "failed"` y `error_message` = codigo de salida + ultimas ~20 lineas
   + la ruta del log en VM2.

El orden de 3 y 4 importa: el callback sale **fuera** del semaforo. Si estuviera
dentro, una API caida retendria un slot los 30 segundos del timeout del POST por
cada job fallido.

Un `DELETE` no genera callback: quien lo pidio ya lo sabe, y
`fail_timed_out_analysis` marca los jobs como fallidos por su cuenta.

El callback sintetico reutiliza `env["API_BASE_URL"]`, `env["API_KEY"]` y
`env["API_JOBS_CALLBACK"]` **del propio job**. El ejecutor no necesita
configuracion propia para hablar con la API, y no puede desincronizarse.

### 4.3 Concurrencia

Un `asyncio.Semaphore` de `EXECUTOR_MAX_CONCURRENCY` (3), sin scheduler aparte:
sus waiters se despiertan en orden FIFO, que es exactamente la cola pedida, y un
job esperando el semaforo **es** un job en estado `queued`. Sin prioridades: el
pipeline es lineal y dentro de un mismo paso de fan-out todas las instancias
valen igual.

Watchdog por contenedor a `EXECUTOR_JOB_TIMEOUT_SECONDS` (3600, el mismo
`--replica-timeout` de Azure): `kill` y transicion a `timed_out`.

### 4.4 Seguridad

Montar `/var/run/docker.sock` en un contenedor equivale a dar root en VM2. Las
mitigaciones, en orden de importancia:

1. **La API no manda nombres de imagen.** Solo `service_name`, validado contra
   `EXECUTOR_ALLOWED_SERVICES` (lista exacta, en la unidad systemd). Lo peor que
   puede pedir un atacante con la API key es correr una imagen que ya publicamos.
2. **Nada de lo que llega por HTTP se traduce en opciones de `docker run`.**
   Ni volumenes, ni `--network`, ni `--privileged`, ni entrypoint. Solo el
   diccionario `env`.
3. **El puerto solo lo ve VM1.** Publicado en `10.97.0.12:8080` y filtrado en
   `DOCKER-USER` (DROP 8080 + RETURN desde `10.97.0.11`), igual que el registry.
4. **API key propia**, distinta de `BACKEND_API_KEY`, en
   `/etc/licitaciones-executor/executor.env` con modo 600.

Alternativa evaluada y descartada por ahora: un `docker-socket-proxy` delante
del socket para limitar los verbos a `POST /containers/create|start|kill` y
`GET /containers/*/logs`. Suma una pieza mas para un beneficio marginal dado
que 1 y 2 ya acotan lo que se puede pedir. Queda anotado por si el ejecutor
alguna vez se expone mas alla de VM1.

### 4.5 Configuracion del ejecutor

| Variable | Default | Nota |
|---|---|---|
| `EXECUTOR_API_KEY` | (requerida) | distinta de `BACKEND_API_KEY` |
| `EXECUTOR_REGISTRY` | `vm2:5000` | prefijo de la imagen |
| `EXECUTOR_ALLOWED_SERVICES` | (requerida) | los 16 nombres, separados por coma |
| `EXECUTOR_MAX_CONCURRENCY` | `3` | |
| `EXECUTOR_MAX_QUEUE` | `200` | por encima devuelve 503 |
| `EXECUTOR_CPUS` | `1.0` | |
| `EXECUTOR_MEMORY` | `1536m` | |
| `EXECUTOR_JOB_TIMEOUT_SECONDS` | `3600` | |
| `EXECUTOR_LOG_DIR` | `/var/log/licitaciones-jobs` | bind mount desde el host |
| `EXECUTOR_LOG_RETENTION_DAYS` | `14` | ciclo de mantenimiento cada hora |
| `EXECUTOR_HISTORY_TTL_MINUTES` | `120` | cuanto sigue consultable una ejecucion terminada por `GET /jobs/{id}`; sin esto el registro en memoria crece toda la vida del proceso |

---

## 5. Cambios por proyecto

### 5.1 `accsa-licitaciones-executor/` (nuevo)

```
accsa-licitaciones-executor/
├── app/
│   ├── config.py        # pydantic-settings, mismas convenciones que la API
│   ├── main.py          # FastAPI: /jobs, /health, /version
│   ├── models.py        # StartJobRequest / StartJobResponse / ExecutionState
│   ├── security.py      # X-API-Key con compare_digest
│   ├── runner.py        # semaforo, docker SDK, watchdog, logs, mantenimiento
│   └── callback.py      # POST del callback sintetico
├── Dockerfile           # corre como root, ver nota abajo
├── .dockerignore
├── .gitignore
├── .env.example
├── requirements.txt     # fastapi, uvicorn, pydantic-settings, docker, httpx
└── README.md
```

Convenciones: las de `accsa-licitaciones-api` (`get_settings()` con `lru_cache`,
endpoints sin logica, singleton al final del modulo). Codigo en ingles.

La version del sistema vive en `app/config.py -> VERSION` y se sirve en
`GET /version`, igual que la API. No lleva archivo `VERSION` suelto: esa
convencion es de los servicios, que la hornean en la imagen con
`COPY VERSION .`. Falta agregar el cuarto proyecto a `RELEASING.md` de la UI.

**La imagen corre como root**, a diferencia de la de la API. Es deliberado: la
frontera de seguridad aca es el socket de Docker montado, y quien lo alcanza
puede arrancar un contenedor privilegiado y quedarse con el host sea cual sea el
UID de este proceso. Un usuario no-root no compraria nada y sumaria dos
requisitos fragiles en tiempo de ejecucion (pasar `--group-add` con el GID del
grupo `docker` de VM2, y hacer coincidir el propietario del directorio de logs
bind-mounteado).

### 5.2 `accsa-licitaciones-api`

| Archivo | Cambio |
|---|---|
| `app/core/config.py` | agregar `JOB_EXECUTOR: str = "azure"`, `EXECUTOR_BASE_URL: str = ""`, `EXECUTOR_API_KEY: str = ""`; **pasar las 6 `AZURE_*` a `str = ""`**; subir `JOB_TIMEOUT_MINUTES` a 150 |
| `app/core/azure.py` | cliente **lazy** (`get_azure_client()` con `lru_cache`) para que la API arranque sin credenciales de Azure; `verify_azure_connection()` devuelve False si no esta configurado |
| `app/core/executor.py` | **nuevo**: cliente httpx del agente (`start_job`, `stop_job`, `health`) |
| `app/services/job_orchestrator_service.py` | `_launch_job` bifurca por `settings.JOB_EXECUTOR` y comparte el insert en `jobs`; `fail_timed_out_analysis` bifurca el stop; `__init__` deja de resolver el cliente en el constructor |
| `app/services/job_orchestrator_service.py` | `on_job_completed`: si la fila de `jobs` ya esta en estado terminal, loguea y devuelve `[]` (idempotencia, decision 8) |
| `app/repositories/job_repository.py` | lectura puntual de un job por identidad, para el guard anterior |
| `app/api/v1/router.py` | `GET /health/executor` que reporta el backend activo: `{"status":"ok","backend":"local","running":1,"queued":0,"capacity":3}` o `{"status":"ok","backend":"azure"}` |
| `.env.example` | bloque nuevo del ejecutor; nota de que `AZURE_*` es opcional |

`build_service_env` **no cambia**. Devuelve la lista de `{name,value}` que
espera Azure; la rama local la convierte a diccionario.

### 5.3 `accsa-licitaciones-ui`

| Archivo | Cambio |
|---|---|
| `src/app/admin/review/status/page.tsx` | la tarjeta "Estado de Azure" pasa a "Ejecucion de Jobs" contra `/api/v1/health/executor`; el JSON ya muestra `backend`, `running`, `queued` |
| `.env.example` | `API_HEALTH_EXECUTOR_PATH=/api/v1/health/executor` reemplaza a `API_HEALTH_AZURE_PATH` |
| `src/lib/database.types.ts` | regenerar tras la migracion (`azure_execution_id` -> `execution_id`) |

### 5.4 Base de datos (MCP Supabase)

```sql
ALTER TABLE public.jobs RENAME COLUMN azure_execution_id TO execution_id;
```

Sigue siendo `text NOT NULL`. No hay backfill: las filas viejas guardan el
resource id de ARM, que es historia valida.

### 5.5 CI

`.github/workflows/build-executor.yml`, calcado de `build-api.yml`:

- `paths`: `accsa-licitaciones-executor/**` y el propio workflow.
- `runs-on: [self-hosted, vm2]`, `concurrency: build-executor`.
- Imagen `vm2:5000/licitaciones-executor`, tags `${GITHUB_SHA}` y `latest`.

`infra/ci.md` pasa a documentar 4 workflows en vez de 3.

### 5.6 `infra/`

| Archivo | Cambio |
|---|---|
| `infra/scripts/executor-deploy.sh` | **nuevo**: crea `/etc/licitaciones-executor/executor.env` (600), `/var/log/licitaciones-jobs`, y la unidad `licitaciones-executor.service` (mismo patron que `registry-deploy.sh`: `docker run` con `--restart` via systemd, `-p 10.97.0.12:8080:8080`, `-v /var/run/docker.sock:/var/run/docker.sock`, `-v /var/log/licitaciones-jobs:/var/log/licitaciones-jobs`, `--add-host vm2:10.97.0.12`) |
| `infra/scripts/docker-firewall.sh` | en el caso `services`, agregar `DROP` de 8080 y `RETURN` desde `10.97.0.11` |
| `infra/vm-services.md` | completar la seccion "Ejecutor de jobs", cerrar la decision abierta 2 y actualizar el checklist (pasos 9 y 10) |
| `infra/README.md` | fase nueva en el indice |

La unidad ya tiene permiso: `harden-base.sh` concede a `sysadmin` sudo NOPASSWD
sobre `licitaciones-executor.service`. No hay que tocar sudoers.

---

## 6. Riesgos y bordes conocidos

1. **El socket de Docker montado es root en VM2.** Mitigado en 4.4. Es la
   contrapartida aceptada de desplegar el ejecutor como una imagen mas.
2. **La cola en memoria se pierde al reiniciar el ejecutor.** Un `docker
   restart` a mitad de un fan-out de 50 archivos deja los encolados sin lanzar;
   el analisis se cae por timeout y hay que usar `retry_job`. Aceptado
   (decision 7). Si molesta en la practica, el paso siguiente es persistir la
   cola en la tabla `jobs` con estado `queued`.
3. **Cola sin fondo.** Sin `EXECUTOR_MAX_QUEUE` un analisis con cientos de
   archivos encola sin limite y la memoria del ejecutor crece. Por encima del
   tope devuelve 503, y la API ya trata el fallo de lanzamiento como fallo del
   paso (`_launch_next_job` esta envuelto en try/except en 250 y 534).
4. **`JOB_TIMEOUT_MINUTES` ahora incluye la espera en cola.** El
   `workflow_step` pasa a `running` cuando la API lanza, no cuando el contenedor
   arranca. Con 3 en paralelo y 50 archivos, el ultimo puede empezar bastante
   despues. Peor caso: espera en cola + 60 min de ejecucion. Por eso 65 -> 150.
   Hay que **medir la duracion real por servicio en el e2e** y ajustar.
5. **`latest` es mutable.** Si un build termina mientras corre un fan-out, dos
   instancias del mismo paso pueden correr imagenes distintas. En Azure pasaba
   igual. Fijar por SHA queda fuera de alcance; se anota.
6. **El runner y los jobs comparten CPU y RAM.** Un build de los 16 servicios
   durante un analisis compite por los mismos 4 vCPU. Los `paths` filter ya
   acotan cuando corre el build; si molesta, bajar `max-parallel` en
   `build-services.yml` o parar el runner durante los analisis.
7. **Exit 0 sin callback sigue colgando el pipeline.** Los servicios se tragan
   el error del POST (2.3), asi que un job que termina bien pero no logra avisar
   queda esperando al `JobMonitor`. **No es una regresion**, pasa igual hoy en
   Azure, y ahora ademas queda el log en VM2 para diagnosticarlo.
8. **`JOB_EXECUTOR=local` presupone la API en VM1.** El contenedor tiene que
   alcanzar `API_BASE_URL` desde VM2, y la regla `DOCKER-USER` de VM1 solo abre
   el 8000 a `10.97.0.12`. Mientras la API siga en Vercel, ese despliegue se
   queda en `azure`. El flag existe justamente para que convivan.
9. **Disco.** 16 imagenes + capas de build + datos del registry en 35 GB, ahora
   tambien con los logs de jobs. El GC del registry sigue pendiente (anotado en
   `vm-services.md`); los logs de jobs se limitan con
   `EXECUTOR_LOG_RETENTION_DAYS`.

---

## 7. Plan por fases

### FASE 0 - Esqueleto y contrato (HECHA 2026-07-28)
- [x] Carpeta `accsa-licitaciones-executor/` con `requirements.txt`,
      `.gitignore`, `.env.example` y `README.md`.
- [x] `config.py` con las 10 variables de 4.5. **Fail-closed**: sin
      `EXECUTOR_API_KEY` ni `EXECUTOR_ALLOWED_SERVICES` no arranca.
- [x] `models.py` con el contrato de 4.1.
- [x] `security.py`: `X-API-Key` con `secrets.compare_digest`, 401.
- [x] `main.py` con las 5 rutas sobre un diccionario en memoria, sin Docker
      todavia. `/version` es la unica sin auth, igual que en la API.
- [x] Verificado con `curl` de punta a punta: 401 sin key y con key invalida,
      400 con servicio fuera de la allowlist, 422 sin `env`, 404 con id
      inexistente, 202 + `queued` en el alta, `DELETE` idempotente sobre un
      estado terminal, y los contadores de `/health` moviendose.

### FASE 1 - Ejecutor real (HECHA 2026-07-28)
- [x] `runner.py`: `asyncio.Semaphore` como cola FIFO, lanzamiento con el SDK de
      Docker (`nano_cpus`, `mem_limit`, `memswap_limit`, `environment`, labels
      `licitaciones.*`, sin `--rm`), pull solo si la imagen falta.
- [x] Watchdog de `EXECUTOR_JOB_TIMEOUT_SECONDS` con `wait_for` + `shield`, para
      poder seguir esperando el mismo `wait` despues del kill.
- [x] Recoleccion: log a archivo, `docker rm`, exit code, slot liberado antes
      del callback.
- [x] `callback.py`: callback sintetico en `failed` / `timed_out`, reusando el
      `API_BASE_URL` / `API_KEY` / `API_JOBS_CALLBACK` del propio job.
- [x] Mantenimiento horario: purga de logs vencidos y de ejecuciones terminadas.
- [x] `/health` reporta `docker: ok|unreachable` y `status: ok|degraded`, para
      que un fallo de acceso al socket se vea sin leer logs.
- [x] `Dockerfile` + `.dockerignore`.
- [x] **Probado contra el Docker real de VM2**, no contra el del equipo: imagen
      construida en VM2, ejecutor corriendo con el socket montado, 4 imagenes
      triviales (`test-reg/service-{echo,boom,slow,hog}`) y un receptor de
      callbacks en un contenedor hermano. Resultados:

  | Caso | Esperado | Obtenido |
  |---|---|---|
  | salida 0 | `succeeded` | `succeeded`, exit 0, sin callback |
  | salida 3 | `failed` + callback | `failed`, exit 3, callback con las ultimas lineas de stderr |
  | OOM con `--memory 64m` | `failed` + callback | `failed`, **exit 137**, callback |
  | `sleep 120` con timeout 10s | `timed_out` + callback | `timed_out`, exit 137, callback |
  | 4 jobs con `capacity=2` | 2 running / 2 queued | 2 running / 2 queued, 2 contenedores vivos |
  | `DELETE` sobre encolado | `stopped`, nunca arranca | `stopped`, sin contenedor ni log |
  | `DELETE` sobre corriendo | `stopped`, sin callback | `stopped`, log guardado, sin callback |
  | slot liberado tras el stop | el siguiente arranca | paso de `queued` a `running` |
  | limpieza | 0 contenedores huerfanos | 0 |

  El callback preserva la identidad: llego con `original_file_id` seteado y
  `file_id` nulo, que es justo lo que el entorno del contenedor no permite
  distinguir. Artefactos del test borrados de VM2.

### FASE 2 - CI y despliegue en VM2 (HECHA 2026-07-29)
- [x] `.github/workflows/build-executor.yml`.
- [x] `infra/scripts/executor-deploy.sh`. Escribe `executor.env` (600), crea
      `/var/log/licitaciones-jobs` y la unidad, y **falla temprano si la imagen
      no esta local**: en VM2 solo el usuario del runner tiene `docker login`,
      asi que `root` no puede hacer pull. Hay que correr el workflow antes.
- [x] Regla 8080 en `infra/scripts/docker-firewall.sh`.
- [x] Desplegado y verificado 2026-07-29: `GET /health` responde desde VM1
      (`docker: ok`, `capacity: 3`) y no desde una estacion. **Ojo**: que no
      responda desde la estacion no prueba la regla `DOCKER-USER`, porque el
      FortiGate ya corta todo salvo el 22 hacia esa vLAN. La prueba valida es
      la de VM1.

### FASE 3 - API (HECHA 2026-07-28)
- [x] `config.py`: flag, variables del ejecutor, `AZURE_*` opcionales,
      `JOB_TIMEOUT_MINUTES=150`.
- [x] `azure.py` lazy (`get_azure_client()` con `lru_cache` +
      `is_azure_configured()`).
- [x] `core/executor.py`. `httpx` pasa a estar declarado en `requirements.txt`:
      hasta ahora entraba solo como dependencia transitiva de supabase.
- [x] `_launch_job` bifurcado, insert en `jobs` compartido. Cada rama devuelve
      `(execution_id, execution_name, response)`; el insert es uno solo.
- [x] `fail_timed_out_analysis` bifurcado.
- [x] Guard de idempotencia en `on_job_completed` +
      `job_repository.get_non_terminal_job`. El criterio no es "la fila esta en
      estado terminal" sino "no queda ninguna fila viva para esa identidad":
      `retry_job` inserta una fila nueva, y con el otro criterio el callback del
      reintento se descartaria como duplicado.
- [x] `GET /health/executor`.
- [x] `.env.example`.
- [x] La API arranca con `JOB_EXECUTOR=local` y **sin** variables `AZURE_*`.

Verificado sin tocar VM2, levantando el ejecutor real contra el Docker local:

| Caso | Resultado |
|---|---|
| Arranque con `JOB_EXECUTOR=local` y cero `AZURE_*` | OK; `verify_azure_connection()` devuelve False sin salir a la red |
| `executor_client.health/start_job/stop_job` contra el agente | OK; el alta devuelve `execution_id` / `execution_name`, que es lo que lee `_launch_local` |
| `service_name` fuera de la allowlist | HTTP 400, propagado como error de lanzamiento |
| `_launch_local` | convierte `[{name,value}]` a dict y **preserva `file_id` vs `original_file_id`** |
| `GET /health/executor` | `backend: local` con contadores; `backend: azure` con el flag en azure; 503 con el agente caido |
| Guard de idempotencia | callback duplicado -> `[]` sin update ni email; con job vivo -> sigue de largo |
| `_launch_azure` / stop por timeout | template, imagen y `begin_stop_execution` iguales que antes; el stop va al backend del flag |

**Ojo con el orden**: el insert sigue escribiendo en `azure_execution_id`. La
columna se renombra a `execution_id` en la FASE 4, y ese rename **tiene que
cambiar tambien `_launch_job` y `fail_timed_out_analysis`**, que hoy la leen y
escriben con el nombre viejo.

### FASE 4 - DB y UI
- [ ] Migracion del rename via MCP Supabase. Al aplicarla, cambiar los tres usos
      de `azure_execution_id` en `job_orchestrator_service.py` (insert de
      `_launch_job`, lectura de `fail_timed_out_analysis`).
- [ ] Regenerar `database.types.ts`.
- [ ] Tarjeta "Ejecucion de Jobs" en `/admin/review/status`.
- [ ] `.env.example` de la UI.
- [ ] `pnpm build` sin errores.

### FASE 5 - Documentacion de infra
- [ ] `infra/vm-services.md`: seccion del ejecutor, decision 2 cerrada,
      checklist 9 y 10.
- [ ] `infra/ci.md`: cuarto workflow.
- [ ] `infra/README.md`.

### FASE 6 - Verificacion e2e
- [ ] Analisis chico (2-3 archivos) de punta a punta con `JOB_EXECUTOR=local`.
- [ ] Analisis con fan-out real (>15 archivos): confirmar que la cola respeta
      los 3 slots y **medir la duracion por servicio** para validar los 150 min.
- [ ] Forzar un OOM (bajar `EXECUTOR_MEMORY` a 128m para un servicio) y
      confirmar que llega el callback sintetico y el analisis falla limpio, sin
      esperar el timeout.
- [ ] Forzar un callback duplicado y confirmar que no se manda dos veces el
      email de fallo.
- [ ] `DELETE /jobs/{id}` sobre un job encolado y sobre uno corriendo.
- [ ] Timeout: `EXECUTOR_JOB_TIMEOUT_SECONDS=30` y confirmar el kill.
- [ ] Reinicio del ejecutor con la cola llena: confirmar que el `JobMonitor`
      termina cerrando el analisis y que `retry_job` lo recupera.
- [ ] Repasar la tabla de 3.1 con los numeros medidos.

### FASE 7 - Eliminar Azure

**Condicion de entrada**: al menos 3 analisis reales completos con
`JOB_EXECUTOR=local` en produccion, sin intervencion manual, y la revision de
3.1 hecha. Hasta entonces esta fase no se toca.

- [ ] `job_orchestrator_service.py`: borrar la rama de Azure en `_launch_job` y
      en `fail_timed_out_analysis`, y el flag `JOB_EXECUTOR`.
- [ ] Borrar `app/core/azure.py` y `GET /health/azure`.
- [ ] Borrar las 6 `AZURE_*` de `app/core/config.py` y de `.env.example`.
- [ ] Quitar `azure-identity` y `azure-mgmt-appcontainers` de
      `accsa-licitaciones-api/requirements.txt`.
- [ ] Borrar los 3 archivos de Azure que quedan versionados en
      `accsa-licitaciones-services/`: `azure-pipelines.yml`,
      `create-azure-container-app-job.sh` y `jobs.sh`. Ojo: `az-token`,
      `credentials` y `backend-credentials` estan gitignored, hay que borrarlos
      a mano de la copia local.
- [ ] `CLAUDE.md` (raiz, API y services) y `DEPLOYMENT.md`: sacar las
      referencias a ACR y Container Apps Jobs.
- [ ] `infra/vm-services.md`: cerrar la decision abierta 5.
- [ ] Apagar ACR y el Container Apps Environment en Azure, una vez que no quede
      nada apuntando ahi.

---

## 8. Fuera de alcance

- Persistir la cola (ver riesgo 2 y 3.1).
- Fijar imagenes por SHA en vez de `latest`.
- Garbage collection del registry.
- Despliegue de front y back en VM1 (`infra/vm-app.md`), que es lo que habilita
  poner `JOB_EXECUTOR=local` en produccion.
- Agregar el cuarto proyecto al proceso de release (`RELEASING.md` en la UI).
