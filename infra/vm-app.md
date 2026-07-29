# VM1 - ACCSA-SerProIA-VM1 (capa app)

Aloja el **frontend** (`accsa-licitaciones-ui`, Next.js 16) y el **backend**
(`accsa-licitaciones-api`, FastAPI). Sustituye a los dos despliegues actuales en
Vercel.

## Identidad

| Campo | Valor |
|-------|-------|
| Nombre en el hipervisor | `ACCSA-SerProIA-VM1` |
| Hostname | `vm1` |
| Rol | Frontend + Backend |
| Credenciales | Ver `vm-credentials.md` (rotadas el 2026-07-28) |

## Hardware asignado

| Recurso | Valor |
|---------|-------|
| vCPU | 2 |
| RAM | 4 GB (3,3 GiB utiles) |
| Disco | 100 GB (`/dev/sda`) |

Layout de disco (tras la ampliacion del 2026-07-28):

```
sda                       100G
├─ sda1                     1G  /boot/efi
├─ sda2                     2G  /boot
└─ sda3                   96,9G  LVM (vg: ubuntu-vg)
   ├─ ubuntu-vg/ubuntu-lv 68,5G  /                 (58G libres)
   ├─ ubuntu-vg/docker-lv 20,0G  /var/lib/docker   (19G libres)
   └─ sin asignar          8,5G  reserva del VG
```

El instalador solo habia usado la mitad del disco. `/var/lib/docker` va en su
propio LV para que el crecimiento de imagenes y capas no pueda llenar `/`.
Los 8,5 GB sin asignar son deliberados: son el margen para ampliar el LV que se
quede corto (`lvextend -r -L +NG /dev/ubuntu-vg/<lv>`). Sin espacio libre en el
grupo no habria de donde crecer.

Entrada en `/etc/fstab` con `nofail`: un problema con ese LV no debe impedir el
arranque de una VM sin consola a mano.

## Red

| Campo | Valor |
|-------|-------|
| Interfaz | `ens33` |
| IP | `10.97.0.11/28` (mascara 255.255.255.240) |
| Gateway | `10.97.0.1` |
| vLAN | FortiVlan 97 |
| DNS | `systemd-resolved` (stub `127.0.0.53`), sin dominio de busqueda |
| Salida a internet | HTTPS saliente funcionando (verificado contra `api.github.com`) |
| Alcance | Solo desde la red 10.97.x / VPN corporativa |

## Acceso

Autenticacion por clave SSH (ed25519). **El acceso por contrasena esta
deshabilitado** desde el hardening del 2026-07-28: si se pierde la clave, el
unico acceso es la consola del hipervisor.

| Campo | Valor |
|-------|-------|
| Usuario | `sysadmin` (con `sudo`, pide contrasena) |
| Clave privada | `~/.ssh/accsa_vm_ed25519` (equipo de desarrollo) |
| Clave publica instalada en | `/home/sysadmin/.ssh/authorized_keys` |
| Alias SSH | `vm1-app` |
| Root por SSH | Deshabilitado con contrasena (`PermitRootLogin prohibit-password`); root solo por consola del hipervisor |

```bash
ssh vm1-app
```

Clave publica autorizada:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEV+Yqv0g01hWZSxq8cZ5I9/nVc41HkCwg4535tUeMLD accsa-licitaciones-deploy@Genrys-MacBook-Pro
```

## Baseline del sistema (tras el hardening del 2026-07-28)

| Item | Estado |
|------|--------|
| SO | Ubuntu 26.04 LTS |
| Kernel | 7.0.0-28-generic, x86_64 |
| `sudo` | **sudo-rs** (reescritura en Rust, subconjunto de funciones). Ver `hardening.md` |
| Zona horaria | `America/Montevideo`, chrony contra NTP publico |
| Firewall | `ufw` **activo**: 22 y 80/tcp desde `10.97.0.0/28`; 8000/tcp solo desde `10.97.0.12` |
| fail2ban | Activo, jail `sshd` (ver la nota sobre el SNAT del gateway) |
| auditd | Activo, 9 reglas |
| Puertos en escucha | 22 (sshd), 53 (resolver local) |
| AppArmor | Activo, perfiles por defecto de la distro |
| `unattended-upgrades` | Solo `-security`, sin reinicio automatico |
| Usuario de servicio | `licitaciones` (sistema, `nologin`, home `/opt/licitaciones`) |
| Docker | Engine 29.6.2 + compose v5.3.1, root en LV dedicado |
| Registry | `docker login` hecho contra `vm2:5000` como usuario `vm1` |
| Node.js / Python en el host | No hacen falta: todo va en contenedores |

## Arquitectura de despliegue prevista

Dos contenedores, un unico `docker compose` en `/opt/licitaciones`. **No hay
nginx en esta VM**: el TLS y la redireccion los resuelve un proxy corporativo
anterior, que entrega HTTP plano al puerto 80.

```
Navegador ──HTTPS──► Proxy corporativo (TLS + redirect, fuera de estas VMs)
                       │ HTTP :80
                       ▼
                     ui   (contenedor Next.js)   10.97.0.11:80
                       │ red interna de compose
                       ▼
                     api  (contenedor FastAPI)   :8000
                       ├──► Supabase (SaaS)      [PostgreSQL + Storage]
                       ├──► Qdrant (AWS sa-east-1)
                       └──► VM2 10.97.0.12       [lanzamiento de jobs]
                              ◄── callbacks de los jobs a 10.97.0.11:8000
```

| Contenedor | Imagen | Publicacion en el host |
|------------|--------|------------------------|
| `ui` | `licitaciones-ui:<tag>` (Next.js, output `standalone`) | `10.97.0.11:80 -> 3000` |
| `api` | `licitaciones-api:<tag>` (FastAPI + uvicorn) | `10.97.0.11:8000 -> 8000`, solo para los callbacks de VM2 |

**El navegador nunca habla con la API.** La UI hace de proxy server-side de
todas las llamadas (es como esta construida hoy), asi que `api` solo necesita ser
alcanzable por dos cosas: el contenedor `ui` a traves de la red interna de
compose (`http://api:8000`) y los jobs de VM2 que hacen callback.

Los dos contenedores publican **sobre la IP concreta** (`10.97.0.11:80:3000`,
nunca `80:3000`). Los puertos publicados por Docker se saltan `ufw` (ver
`hardening.md`), asi que el bind explicito es lo unico que evita que queden
escuchando en todas las interfaces.

Restringir el 8000 a VM2 de verdad necesita una regla en la cadena
`DOCKER-USER`, porque la de `ufw` no se evalua para trafico a contenedores. Ya
esta puesta, via `licitaciones-docker-firewall.service` (`RETURN` para
`10.97.0.12`, `DROP` para el resto), y se reaplica en cada arranque de Docker.

### De donde salen las imagenes

Con 2 vCPU y 4 GB, `next build` en esta VM es arriesgado (el build de Next se
come facilmente mas de 2 GB). Las imagenes de `ui` y `api` se construyen en el
pipeline y VM1 solo hace `pull` **desde el registry de VM2**:

```
build (pipeline) ──push──► registry VM2 :5000 ──pull──► VM1 docker compose up
```

Esto encaja con la regla de `ufw` de VM2, que ya permite el puerto 5000
unicamente desde `10.97.0.11`. VM1 necesitara `docker login` contra ese registry
y la CA que firme su certificado.

### TLS

Fuera del alcance de esta VM: lo termina el proxy corporativo anterior. VM1 solo
sirve HTTP en el 80.

### Variables de entorno a migrar

- API: `SUPABASE_URL`, `SUPABASE_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`,
  `BACKEND_API_KEY`, `SERVICE_API_BASE_URL`, `SUPABASE_ARTIFACTS_BASE_URL` y el
  bloque `AZURE_*` (que se reemplaza por la config del ejecutor de jobs en VM2).
- `SERVICE_API_BASE_URL` deja de ser la URL de Vercel: es la direccion a la que
  los jobs de VM2 hacen callback, asi que debe ser alcanzable desde
  `10.97.0.12` (la IP o el nombre DNS de esta VM, no `localhost`).
- UI: las rutas `API_*` y la URL del backend apuntan al servicio `api` por
  nombre de red de compose (`http://api:8000`), no a `127.0.0.1`.
- Los secretos van en un `.env` con permisos 600 propiedad de `licitaciones`,
  referenciado desde compose. No se hornean en las imagenes.

## Checklist

| # | Paso | Estado |
|---|------|--------|
| 1 | Acceso por clave SSH (`sysadmin`) | Hecho 2026-07-28 |
| 2 | Rotacion de contrasenas root/sysadmin | Hecho 2026-07-28 |
| 3 | Ampliar LV + LV dedicado para `/var/lib/docker` | Hecho 2026-07-28 |
| 4 | Hardening completo (16 medidas, ver `hardening.md`) | Hecho 2026-07-28 |
| 5 | Instalar Docker Engine + compose plugin | Hecho 2026-07-28 |
| 6 | Dockerfile de la API y de la UI | Hecho 2026-07-28 (junto con los workflows de build) |
| 7 | `docker compose` en `/opt/licitaciones` + `.env` | Script escrito (`scripts/app-deploy.sh`), sin ejecutar |
| 8 | Regla `DOCKER-USER` para el 8000 (hecha) + alta en el proxy corporativo | Parcial |
| 9 | `docker login` contra el registry de VM2 | Hecho 2026-07-28 |
| 10 | Conectividad VM1 <-> VM2 (lanzar jobs / recibir callbacks) | Pendiente |
| 11 | Pruebas e2e del pipeline completo | Pendiente |

### `scripts/app-deploy.sh`

Crea `/opt/licitaciones` con `docker-compose.yml`, `.env.api` y `.env.ui` (600,
de `licitaciones`), la unidad `licitaciones-app.service`, levanta los dos
contenedores y verifica. **Son dos archivos de entorno, no uno**: el contenedor
de la UI no tiene por que llevar la service key de Supabase, la del ejecutor ni
las credenciales de proveedores.

Prerrequisitos, en orden:

1. El ejecutor desplegado en VM2 (`executor-deploy.sh`), porque el chequeo final
   del script pega a `/api/v1/health/executor`.
2. `/opt/deploy/ui-build.env` en **VM2** con los `NEXT_PUBLIC_*` del entorno
   on-prem: `build-ui.yml` los lee de ahi y los hornea en el bundle. No se
   pueden cambiar despues por entorno del contenedor; hay que reconstruir.
   `NEXT_PUBLIC_APP_VERSION` no va: sale de `package.json` via `next.config.ts`.
3. Las imagenes `licitaciones-api` y `licitaciones-ui` publicadas en el registry.
4. Credenciales de proveedores cargadas en Vault, o `start_pipeline` aborta en
   el pre-flight.

El chequeo que importa es el de `/api/v1/health/executor`: es el que demuestra
que VM1 alcanza el 8080 de VM2 a traves de la regla `DOCKER-USER` que solo deja
entrar a `10.97.0.11`.

Nota: `.env.ui` todavia define `API_HEALTH_AZURE_PATH`, que es lo que lee la UI
hoy. Pasa a `API_HEALTH_EXECUTOR_PATH` en la FASE 4 de
`features/pending/12-ejecutor-jobs-on-prem.md`.

## Decisiones abiertas

1. ~~Runtime nativo o contenedores en VM1.~~ Resuelto: **contenedores**, front y
   back con Docker mas un nginx que expone el front por HTTPS.
2. ~~TLS.~~ Resuelto: lo termina el proxy corporativo anterior; VM1 sirve HTTP
   plano en el 80.
3. **Nombre DNS interno.** Hoy solo hay IP; conviene un `licitaciones.accsa.local`
   (o similar) para no cablear IPs en la configuracion. Hace falta ademas saber
   con que nombre publica el proxy la app, porque ese es el valor que la UI y la
   API tienen que reconocer (cookies de sesion, CORS, redirecciones de auth).
4. **Exposicion externa.** Si la app debe usarse fuera de la red 10.97.x, hace
   falta publicacion/NAT en el Forti y certificado valido.
5. ~~Zona horaria.~~ Resuelto: `America/Montevideo` con NTP publico.
