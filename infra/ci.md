# CI: construccion de imagenes

Un workflow por proyecto en `.github/workflows/`, cada uno disparado solo por
cambios en su propia carpeta. Todos corren en el runner self-hosted de VM2
(etiquetas `self-hosted`, `vm2`) y publican en `vm2:5000`.

| Workflow | Se dispara con | Imagen |
|----------|----------------|--------|
| `build-api.yml` | `accsa-licitaciones-api/**` | `vm2:5000/licitaciones-api` |
| `build-ui.yml` | `accsa-licitaciones-ui/**` | `vm2:5000/licitaciones-ui` |
| `build-services.yml` | `accsa-licitaciones-services/**` | `vm2:5000/<service-name>` **y** `accsalicitaciones.azurecr.io/services/<service-name>` |

Cada imagen se publica con dos tags: el SHA completo del commit y `latest`.
`latest` es el que consume el orquestador (`_launch_job` arma
`{registry}/{service_name}:latest`).

`build-api.yml` y `build-ui.yml` no usan secretos: el `docker login` contra
`vm2:5000` esta hecho en la maquina, como `deploy` (ver `github-runner.md`). La
API y la UI en Azure/Vercel no se despliegan desde imagenes, asi que no tienen
nada que publicar en ACR.

## Los servicios se publican en los dos registros

Azure sigue en uso: los Container Apps Jobs tiran de ACR y el ejecutor de VM2
tira del registry local. Si el build publicara solo en VM2, la infra de Azure se
quedaria congelada en la ultima imagen que dejo Azure DevOps. Por eso
`build-services.yml` etiqueta cada imagen cuatro veces (SHA y `latest` en cada
registro) y hace los cuatro `push`.

- El path en ACR es `services/<service-name>`, que es lo que apunta
  `AZURE_CONTAINER_REGISTRY` en la API (`accsalicitaciones.azurecr.io/services`).
- Empuja primero a VM2: si el enlace a Azure falla, el job falla, pero on-prem
  ya quedo actualizado.
- Credenciales en secretos del repositorio: `ACR_USERNAME` y `ACR_PASSWORD`
  (las mismas del admin user de ACR que usaba `azure-pipelines.yml` en
  `AZURE_REGISTRY_USER` / `AZURE_REGISTRY_PASS`). El `docker login` se hace al
  empezar cada job de la matriz y el `logout` corre siempre al terminar, para no
  dejarlas en el `~/.docker/config.json` del runner.
- Requiere salida a internet de VM2 hacia `*.azurecr.io`, que es la unica
  dependencia nueva del runner ademas de GitHub.

`accsa-licitaciones-services/azure-pipelines.yml` queda como referencia
historica: el build ya no vive en Azure DevOps.

## Los servicios se construyen de a uno, no los 16

`build-services.yml` tiene un job `detect` que compara el commit anterior
(`github.event.before`) con el actual y arma la matriz de servicios a construir:

- Si cambio `global/` o `VERSION`, se reconstruyen **los 16**: todos los
  Dockerfile copian esos archivos.
- Si no, solo los directorios `service-*` tocados por el push.
- Si no hay commit base utilizable (primer push, force-push), se construyen
  todos por precaucion.
- `workflow_dispatch` acepta `rebuild_all: true` para forzar la reconstruccion completa.

El job `build` se salta entero cuando la lista queda vacia.

Los identificadores del workflow estan en ingles, como el resto del codigo;
esta documentacion sigue en espanol a proposito.

El contexto de build es `accsa-licitaciones-services/` y no la carpeta del
servicio, porque cada Dockerfile hace `COPY VERSION .` y
`COPY global/supabase_logger.py .` ademas de lo suyo.

## Lo que aprendio la primera ejecucion

**`node` no existe en el host.** Solo esta dentro de los contenedores. Cualquier
paso del workflow que lo invoque falla; para leer la version del `package.json`
se usa `grep`.

**La deteccion por servicio estaba rota.** `git diff --name-only` imprime rutas
relativas a la raiz del repositorio aunque se lo invoque desde un subdirectorio,
asi que el `grep '^service-'` original no matcheaba nunca: un cambio normal en
un servicio resolvia matriz vacia y no se construia ninguna imagen. Solo se
noto al forzar la construccion completa, porque ese camino no pasa por el grep.

**Cuidado con los patrones amplios en `.dockerignore` de la UI.** Un `*.md`
dejaba `CHANGELOG.md` fuera del contexto y el prerender de `/changelog` moria
con `ENOENT`; el mismo patron habria vaciado `content/help/` (31 archivos que
alimentan `/ayuda`), y un `*.png` se habria llevado las imagenes de `public/`.
La app resuelve esas rutas con `process.cwd()`, asi que ademas tienen que estar
en el stage de runtime, no solo en el de build.

## Estado verificado (2026-07-28)

Las **18 imagenes** publicadas, cada una con su SHA y `latest`:
`licitaciones-api` (466 MB), `licitaciones-ui` (1,14 GB) y los 16 servicios.

Los 16 servicios se construyeron en **8 minutos** de punta a punta, en serie
(hay un solo runner). El mas lento tardo menos de un minuto: comparten la capa
base `python:3.12-slim` y solo se diferencian en el `pip install`.

VM1 hace `pull` correctamente. El LV de Docker de VM2 va por 713 MB de 35 GB,
con 37 imagenes locales entre las construidas y sus capas intermedias.

## Pendientes

- **La UI pesa 1,14 GB** porque arrastra `node_modules` completo. Con
  `output: "standalone"` en `next.config.ts` bajaria muchisimo, pero es un
  cambio en la config de la app y hoy sigue desplegada en Vercel: queda a
  decision del equipo.
- **Retencion:** cada push deja un tag por SHA. Hace falta una limpieza
  periodica (`registry garbage-collect` mas el borrado del directorio del
  repositorio, ver `vm-services.md`).
