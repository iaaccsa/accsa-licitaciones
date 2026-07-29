# VM2 - ACCSA-SerProIA-VM2 (capa de servicios)

Aloja el **registry Docker privado** y la ejecucion de los **16 microservicios**
de `accsa-licitaciones-services`. Sustituye a Azure Container Registry + Azure
Container Apps Jobs.

## Identidad

| Campo | Valor |
|-------|-------|
| Nombre en el hipervisor | `ACCSA-SerProIA-VM2` |
| Hostname | `vm2` |
| Rol | Docker registry privado + ejecutor de jobs |
| Credenciales | Ver `vm-credentials.md` (rotadas el 2026-07-28) |

## Hardware asignado

| Recurso | Valor |
|---------|-------|
| vCPU | 4 |
| RAM | 6 GB (5,3 GiB utiles) |
| Disco | 100 GB (`/dev/sda`) |

Layout de disco (tras la ampliacion del 2026-07-28):

```
sda                       100G
├─ sda1                     1G  /boot/efi
├─ sda2                     2G  /boot
└─ sda3                   96,9G  LVM (vg: ubuntu-vg)
   ├─ ubuntu-vg/ubuntu-lv 53,5G  /                 (43G libres)
   ├─ ubuntu-vg/docker-lv 35,0G  /var/lib/docker   (33G libres)
   └─ sin asignar          8,5G  reserva del VG
```

Los 35 GB de `docker-lv` cargan con todo lo pesado de esta VM: las 16 imagenes
de servicio, la cache de capas del build y **los datos del registry**, que iran
en un volumen Docker (`/var/lib/docker/volumes/...`) para que queden en el mismo
LV. Aislarlo de `/` evita que un registry sin garbage collection tumbe el
sistema operativo.

Los 8,5 GB sin asignar son la reserva para ampliar el LV que se quede corto:
`sudo lvextend -r -L +8G /dev/ubuntu-vg/docker-lv`. Entrada en `/etc/fstab` con
`nofail`.

## Red

| Campo | Valor |
|-------|-------|
| Interfaz | `ens33` |
| IP | `10.97.0.12/28` (mascara 255.255.255.240) |
| Gateway | `10.97.0.1` |
| vLAN | FortiVlan 97 |
| DNS | `systemd-resolved` (stub `127.0.0.53`), sin dominio de busqueda |
| Salida a internet | HTTPS saliente funcionando (verificado contra `api.github.com`) |
| Alcance entrante | Solo desde la red 10.97.x / VPN corporativa |

## Acceso

| Campo | Valor |
|-------|-------|
| Usuario | `sysadmin` (con `sudo`, pide contrasena; solo-clave desde el hardening) |
| Clave privada | `~/.ssh/accsa_vm_ed25519` (equipo de desarrollo) |
| Clave publica instalada en | `/home/sysadmin/.ssh/authorized_keys` |
| Alias SSH | `vm2-services` |
| Root por SSH | Deshabilitado con contrasena (`PermitRootLogin prohibit-password`) |

```bash
ssh vm2-services
```

Misma clave publica que VM1 (ver `vm-app.md`).

## Baseline del sistema (tras el hardening del 2026-07-28)

| Item | Estado |
|------|--------|
| SO | Ubuntu 26.04 LTS |
| Kernel | 7.0.0-28-generic, x86_64 |
| `sudo` | **sudo-rs** (reescritura en Rust, subconjunto de funciones). Ver `hardening.md` |
| Zona horaria | `America/Montevideo`, chrony contra NTP publico |
| Firewall | `ufw` **activo**: 22/tcp desde `10.97.0.0/28`, 5000/tcp solo desde `10.97.0.11` |
| fail2ban | Activo, jail `sshd` (ver la nota sobre el SNAT del gateway) |
| auditd | Activo, 9 reglas |
| Puertos en escucha | 22 (sshd), 53 (resolver local) |
| AppArmor | Activo, perfiles por defecto de la distro |
| `unattended-upgrades` | Solo `-security`, sin reinicio automatico |
| Usuario de servicio | `deploy` (sistema, `nologin`, home `/opt/deploy`, en grupo `docker`) |
| Docker | Engine 29.6.2 + compose v5.3.1, root en LV dedicado |

> **Resuelto lo de Docker vs ufw:** el registry se publica sobre la IP concreta
> (`-p 10.97.0.12:5000:5000`) y el filtrado real lo hace
> `licitaciones-docker-firewall.service`, que inserta en la cadena
> `DOCKER-USER` un `RETURN` para `10.97.0.11` y un `DROP` para el resto.
> Verificado: desde VM1 el pull funciona, desde una estacion por VPN el puerto
> no responde.

## Servicios a alojar

16 imagenes, una por carpeta de `accsa-licitaciones-services`:

```
service-file-extractor            service-admissibility-extractor
service-files-converter-mistral   service-admissibility-matcher
service-qdrant-by-file            service-admissibility-gate
service-file-metadata-extractor   service-build-proposal-index
service-digital-sig-extractor     service-tender-classifier
service-documents-classifier      service-requirement-extractor
service-documents-grouper         service-compliance-matcher
service-economic-offer-extractor  service-compliance-summarizer
```

Todas son **jobs efimeros**: arrancan, procesan un `ANALYSIS_ID` (a veces con
`PROPOSAL_ID` / `FILE_ID`), hacen callback a la API y terminan. Las imagenes no
llevan configuracion: el orquestador inyecta el entorno completo en cada
lanzamiento (`build_service_env` en
`accsa-licitaciones-api/app/services/job_orchestrator_service.py:372`).

## Arquitectura prevista

```
GitHub (push a main)
  └─► pipeline (GitHub Actions)  ──build──► imagen
                                  ──push──► registry privado VM2 :5000

API en VM1 ──lanza job──► ejecutor en VM2 ──docker run──► service-xxx:latest
                                                            │
                                          callback HTTP ────┘──► API en VM1
```

Estado de los componentes de VM2:

| Componente | Estado |
|------------|--------|
| Docker Engine 29.6.2 + compose v5.3.1 | Instalado, storage driver `overlayfs`, root en el LV dedicado |
| Registry privado `registry:3` | Corriendo, TLS + htpasswd, unidad `licitaciones-registry.service` |
| Runner de GitHub self-hosted | Registrado y escuchando (`github-runner.md`) |
| Ejecutor de jobs | **Pendiente** (reemplazo de Azure Container Apps Jobs, ver abajo) |

### Registry

Sirve **18 imagenes**, no 16: los 16 servicios mas `licitaciones-ui` y
`licitaciones-api`, que VM1 se descarga desde aqui en lugar de construirlas en
su propio hardware (2 vCPU / 4 GB no dan para un `next build` comodo). La regla
de `ufw` que abre el 5000 solo a `10.97.0.11` es justamente para eso.

Desplegado el 2026-07-28:

| Item | Valor |
|------|-------|
| Endpoint | `https://vm2:5000` (tambien `registry.licitaciones.local`, `10.97.0.12`) |
| Imagen | `registry:3` |
| Datos | volumen `licitaciones-registry-data` (queda en el LV de Docker) |
| Config | `/etc/licitaciones-registry/{certs,auth}`, modo 700 |
| Unidad | `licitaciones-registry.service`, enabled |
| Borrado | `REGISTRY_STORAGE_DELETE_ENABLED=true` (necesario para el GC) |

Los nombres `vm1`, `vm2` y `registry.licitaciones.local` se resuelven por
`/etc/hosts` en ambas VMs: no hay DNS interno.

**TLS con CA propia.** No habia CA corporativa disponible, asi que se genero una
en VM2 (`ACCSA Licitaciones Internal CA`, 10 anos) y con ella el certificado del
registry (5 anos, SAN para los tres nombres y las dos IPs). La CA esta instalada
en las dos VMs, en `/etc/docker/certs.d/vm2:5000/ca.crt` y en el almacen del
sistema. Asi se evita `insecure-registries`.

**Auth basica con htpasswd (bcrypt), dos cuentas:** `pipeline` y `vm1`. Ojo:
el registry con htpasswd **no tiene ACL por usuario**, las dos pueden leer y
escribir. Estan separadas para poder rotar o revocar por origen, no por permiso.
Contrasenas en `vm-credentials.md`.

**El `docker login` vive en las maquinas, no en GitHub:** `deploy` en VM2 (para
el runner) y `root` en VM1 (que es quien corre los contenedores).
**Retencion pendiente de definir:** la idea es `latest` + tag por commit SHA.
Con 18 imagenes y 35 GB de LV hace falta garbage collection periodica. Ojo con
un detalle del registry: `registry garbage-collect` libera los blobs pero **deja
el repositorio vacio en el catalogo**; para que desaparezca hay que borrar su
directorio de `/var/lib/registry/docker/registry/v2/repositories/`.

### Ejecutor de jobs (el cambio de mayor impacto)

> **Decidido y especificado.** El diseno completo, con contrato HTTP, limites,
> riesgos y plan por fases, esta en
> `features/pending/12-ejecutor-jobs-on-prem.md`. Resumen: agente HTTP propio en
> VM2 (proyecto nuevo `accsa-licitaciones-executor`, imagen en el registry, con
> el socket de Docker montado), 3 contenedores simultaneos de 1 CPU / 1,5 GB, y
> flag `JOB_EXECUTOR=local|azure` en la API para poder volver atras. Esta
> seccion se reescribe al implementarlo (FASE 5 del feature).

Hoy la API llama al SDK de Azure:
`azure_container_apps_client.jobs.begin_start(resource_group, job_name, template)`
con la lista de variables de entorno del job
(`accsa-licitaciones-api/app/core/azure.py`, `job_orchestrator_service.py:390`).

En VM2 hay que sustituir esa llamada. Opciones:

| Opcion | Como funciona | Valoracion |
|--------|---------------|------------|
| **Agente HTTP en VM2** (recomendado) | Servicio pequeno que expone `POST /jobs/start` con API key, valida el nombre del servicio contra una lista blanca y hace `docker run -d --rm` con el env recibido | Aisla el socket de Docker, la API cambia solo en `_launch_job`, control de concurrencia en un solo sitio |
| Docker socket por TLS | La API en VM1 habla directo al daemon de VM2 con `docker-py` | Menos codigo, pero exponer el daemon equivale a dar root en VM2 |
| SSH + `docker run` | La API ejecuta por SSH | Simple pero fragil: manejo de errores, claves y timeouts |
| Cola (Redis/RabbitMQ) + worker | La API encola, VM2 consume | El mas robusto para picos, mayor coste de implementacion |

En cualquier caso hay que preservar: registro en la tabla `jobs`, callback a
`/api/v1/jobs/callback`, y los campos `azure_execution_id` / `execution_name`
(renombrar o reutilizar como identificador de contenedor).

### Limite de concurrencia

Los pasos con fan-out (`service-qdrant-by-file`, `service-file-metadata-extractor`,
`service-digital-sig-extractor`, `service-admissibility-matcher`,
`service-compliance-matcher`) lanzan **un job por archivo o por propuesta**. En
Azure eso escalaba solo; en 4 vCPU / 6 GB no. El ejecutor **debe** limitar los
contenedores simultaneos (arranque sugerido: 3-4) y encolar el resto, ademas de
fijar `--memory` y `--cpus` por contenedor.

## Pipeline GitHub -> registry

**Decidido: runner self-hosted en VM2.** Los runners alojados por GitHub no
alcanzan `10.97.0.12` (IP privada detras del Forti), asi que el `docker push`
directo no era posible. El runner se instala en VM2, sale a internet hacia
GitHub (ya verificado) y hace build + push contra `localhost:5000`, sin abrir
ningun puerto entrante.

Pasos de alta, secretos y riesgos: **`github-runner.md`**.

Contrapartida asumida: el build consume CPU y RAM de la misma VM que ejecuta los
jobs del pipeline. De ahi los filtros por `paths` y el limite de concurrencia en
el workflow.

Consideracion aparte: hoy el build vive en **Azure DevOps**
(`accsa-licitaciones-services/azure-pipelines.yml`, matriz de 16 servicios).
Migrar a GitHub Actions implica portar esa matriz y decidir si se construyen los
16 servicios en cada push o solo los que cambiaron (`paths` filter, muy
recomendable en un runner de 4 vCPU).

## Checklist

| # | Paso | Estado |
|---|------|--------|
| 1 | Acceso por clave SSH (`sysadmin`) | Hecho 2026-07-28 |
| 2 | Rotacion de contrasenas root/sysadmin | Hecho 2026-07-28 |
| 3 | Particionado: LV dedicado para `/var/lib/docker` + ampliar `/` | Hecho 2026-07-28 |
| 4 | Hardening completo (16 medidas, ver `hardening.md`) | Hecho 2026-07-28 |
| 5 | Instalar Docker Engine | Hecho 2026-07-28 |
| 6 | Desplegar registry privado con TLS + htpasswd | Hecho 2026-07-28 |
| 7 | Runner self-hosted registrado y operativo | Hecho 2026-07-28 |
| 8 | Portar la matriz de build de Azure DevOps a GitHub Actions | Hecho 2026-07-28 (`ci.md`) |
| 9 | Implementar el ejecutor de jobs + limite de concurrencia | Especificado, sin implementar |
| 10 | Cambiar `_launch_job` en la API para usar el ejecutor | Especificado, sin implementar |
| 11 | Retencion / garbage collection del registry | Pendiente |
| 12 | Pruebas e2e del pipeline completo | Pendiente |

## Decisiones abiertas

1. ~~**Estrategia del pipeline**~~. Cerrada: runner self-hosted en VM2, un
   workflow por proyecto con filtro por `paths`. Ver `ci.md`.
2. ~~**Ejecutor de jobs**~~. Cerrada: agente HTTP en VM2, ver
   `features/pending/12-ejecutor-jobs-on-prem.md`.
3. **Registry propio o GitHub Container Registry.** Si `ghcr.io` es aceptable, el
   pipeline se simplifica muchisimo (runners alojados, sin registry que
   mantener) y VM2 solo tendria que hacer `pull`. El usuario pidio registry
   local, se documenta la alternativa por si el trafico saliente esta permitido.
4. **Cache de conversion Mistral y artefactos temporales.** Verificar cuanto
   disco usan los jobs en `/tmp` durante la conversion de PDFs grandes.
5. **Que pasa con Azure.** Si ACR y Container Apps se apagan, hay que limpiar
   `AZURE_*` de la configuracion de la API y de la documentacion.
