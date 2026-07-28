# CI: construccion de imagenes

Un workflow por proyecto en `.github/workflows/`, cada uno disparado solo por
cambios en su propia carpeta. Todos corren en el runner self-hosted de VM2
(etiquetas `self-hosted`, `vm2`) y publican en `vm2:5000`.

| Workflow | Se dispara con | Imagen |
|----------|----------------|--------|
| `build-api.yml` | `accsa-licitaciones-api/**` | `vm2:5000/licitaciones-api` |
| `build-ui.yml` | `accsa-licitaciones-ui/**` | `vm2:5000/licitaciones-ui` |
| `build-services.yml` | `accsa-licitaciones-services/**` | `vm2:5000/<service-name>` |

Cada imagen se publica con dos tags: el SHA completo del commit y `latest`.
`latest` es el que consume el orquestador (`_launch_job` arma
`{registry}/{service_name}:latest`).

Ninguno usa secretos de GitHub: el `docker login` esta hecho en la maquina, como
`deploy`. Ver `github-runner.md`.

## Los servicios se construyen de a uno, no los 16

`build-services.yml` tiene un job `detectar` que compara el commit anterior
(`github.event.before`) con el actual y arma la matriz de servicios a construir:

- Si cambio `global/` o `VERSION`, se reconstruyen **los 16**: todos los
  Dockerfile copian esos archivos.
- Si no, solo los directorios `service-*` tocados por el push.
- Si no hay commit base utilizable (primer push, force-push), se construyen
  todos por precaucion.
- `workflow_dispatch` acepta `todos: true` para forzar la reconstruccion completa.

El job de construccion se salta entero cuando la lista queda vacia.

El contexto de build es `accsa-licitaciones-services/` y no la carpeta del
servicio, porque cada Dockerfile hace `COPY VERSION .` y
`COPY global/supabase_logger.py .` ademas de lo suyo.

## Lo que aprendio la primera ejecucion

**`node` no existe en el host.** Solo esta dentro de los contenedores. Cualquier
paso del workflow que lo invoque falla; para leer la version del `package.json`
se usa `grep`.

**Cuidado con los patrones amplios en `.dockerignore` de la UI.** Un `*.md`
dejaba `CHANGELOG.md` fuera del contexto y el prerender de `/changelog` moria
con `ENOENT`; el mismo patron habria vaciado `content/help/` (31 archivos que
alimentan `/ayuda`), y un `*.png` se habria llevado las imagenes de `public/`.
La app resuelve esas rutas con `process.cwd()`, asi que ademas tienen que estar
en el stage de runtime, no solo en el de build.

## Estado verificado (2026-07-28)

| Imagen | Tamano | Tags |
|--------|--------|------|
| `licitaciones-api` | 466 MB | SHA + `latest` |
| `licitaciones-ui` | 1,14 GB | SHA + `latest` |

VM1 hace `pull` de las dos correctamente. El LV de Docker de VM2 va por 348 MB
de 35 GB.

## Pendientes

- **Los 16 servicios no se construyeron todavia:** el primer push no toco
  `accsa-licitaciones-services/`, asi que `detectar` resolvio lista vacia, que
  es el comportamiento correcto. Para poblar el registry hace falta un
  `workflow_dispatch` con `todos: true`.
- **La UI pesa 1,14 GB** porque arrastra `node_modules` completo. Con
  `output: "standalone"` en `next.config.ts` bajaria muchisimo, pero es un
  cambio en la config de la app y hoy sigue desplegada en Vercel: queda a
  decision del equipo.
- **Retencion:** cada push deja un tag por SHA. Hace falta una limpieza
  periodica (`registry garbage-collect` mas el borrado del directorio del
  repositorio, ver `vm-services.md`).
