# Self-hosted runner de GitHub Actions en VM2

Los runners alojados por GitHub no alcanzan `10.97.0.12` (IP privada detras del
FortiGate), asi que el `docker push` al registry local exige un runner propio.
VM2 tiene salida HTTPS a internet verificada, y el runner **abre la conexion
hacia GitHub**: no hay que abrir ningun puerto entrante.

El runner construye las 18 imagenes (16 servicios + `ui` + `api`) y las publica
en el registry local, contra `localhost:5000`.

## Donde se registra: a nivel de repositorio, sin alternativa

`iaaccsa` es una **cuenta personal de GitHub, no una organizacion**
(`gh api users/iaaccsa` devuelve `"type": "User"`). Los runners de organizacion
y los *runner groups* no existen en cuentas personales, asi que el alta es
forzosamente **por repositorio**.

Refuerza la decision del monorepo: con un unico repo hay un unico alta de runner.
Con tres repos separados harian falta tres runners registrados en la misma VM,
cada uno con su servicio systemd.

## Pasos en GitHub

### 1. Comprobar permisos

Hay que entrar como la cuenta `iaaccsa` (la que posee los repos). La sesion
habitual del equipo de desarrollo, `genrydev`, no la ve.

### 2. Habilitar Actions en el repo

`Settings -> Actions -> General -> Actions permissions`. Con repos privados,
"Allow all actions and reusable workflows" es suficiente. Si se prefiere
restringir: permitir acciones de GitHub y las verificadas por Marketplace.

### 3. Cerrar el flanco de los pull requests de forks

`Settings -> Actions -> General -> Fork pull request workflows`:

- Desmarcar cualquier ejecucion automatica de workflows para PRs de forks.
- Dejar "Require approval for all outside collaborators".

Esto no es opcional. Ver "Riesgo" mas abajo.

### 4. Dar de alta el runner

`Settings -> Actions -> Runners -> New self-hosted runner`, en el repo
`iaaccsa/accsa-licitaciones`.

Elegir **Linux / x64**. GitHub muestra una pagina con la URL de registro y un
**token temporal (caduca en 1 hora)**. Hacen falta esos dos valores para
configurar el runner en VM2; no se guardan en el repo.

### 5. Secretos: no hace falta ninguno para el registry

El runner corre en **la misma VM que el registry**, asi que el `docker login` ya
esta hecho en la maquina, como el usuario `deploy`:

```
/opt/deploy/.docker/config.json   (0600, propiedad de deploy)
```

El workflow pushea a `vm2:5000/...` sin declarar credenciales y GitHub nunca ve
la contrasena del registry. Estan en `vm-credentials.md`.

Guardar la contrasena como secreto de GitHub no habria agregado seguridad real
en esta topologia: quien pueda ejecutar un workflow ya tiene root en VM2 y puede
leer el `htpasswd` del registry directamente. El control que importa es quien
puede disparar workflows (pasos 3 y 6).

Cuando aparezca un secreto que **si** tenga que venir de GitHub (una API key
para tests, por ejemplo), la eleccion entre secreto de repositorio y de
*environment* depende del plan: en repos privados, los *environments* y sus
secretos requieren GitHub Pro, Team o Enterprise. Con Free solo hay secretos de
repositorio, visibles desde cualquier rama.

### 6. Proteger la rama

`Settings -> Branches -> Add rule` sobre `main`: pull request obligatorio antes
de mergear. Quien pueda escribir en `main` puede ejecutar codigo arbitrario en
VM2 (ver "Riesgo").

## Estado actual (2026-07-28)

Runner **registrado y en marcha**.

| Item | Valor |
|------|-------|
| Version | 2.336.0 |
| Nombre | `vm2-licitaciones` |
| Etiquetas | `self-hosted`, `Linux`, `X64`, `vm2` |
| Repo | `iaaccsa/accsa-licitaciones` |
| Ruta | `/opt/deploy/actions-runner`, work dir `/opt/deploy/_work` |
| Usuario | `deploy` (sistema, `nologin`) |
| Servicio | `actions.runner.iaaccsa-accsa-licitaciones.vm2-licitaciones.service`, enabled + active |
| Consumo en reposo | 48 MB de RAM |

Log de arranque: `Connected to GitHub` / `Listening for Jobs`.

```bash
ssh vm2-services 'systemctl status actions.runner.iaaccsa-accsa-licitaciones.vm2-licitaciones --no-pager'
```

Docker esta instalado y `deploy` pertenece al grupo `docker`. **Un cambio de
grupo no lo toma un servicio ya arrancado**: hubo que reiniciar la unidad del
runner despues de `usermod -aG docker deploy`.

Verificado de punta a punta: `deploy` construye, etiqueta y hace push a
`vm2:5000`, y VM1 hace pull de esa misma imagen.

Lo unico que falta para tener CI es **el workflow**.

## Lo que se hizo en VM2 (referencia)

Con la URL y el token del paso 4, como root:

```bash
VER=$(curl -s https://api.github.com/repos/actions/runner/releases/latest \
      | grep -m1 '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
install -d -o deploy -g deploy /opt/deploy/actions-runner /opt/deploy/_work
cd /opt/deploy/actions-runner
curl -fsSL -o runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${VER}/actions-runner-linux-x64-${VER}.tar.gz"
tar xzf runner.tar.gz && rm -f runner.tar.gz
chown -R deploy:deploy /opt/deploy/actions-runner
./bin/installdependencies.sh

# config.sh se niega a correr como root: va con runuser
runuser -u deploy -- ./config.sh \
  --url https://github.com/iaaccsa/accsa-licitaciones --token <TOKEN> \
  --name vm2-licitaciones --labels vm2 \
  --work /opt/deploy/_work --unattended --replace

./svc.sh install deploy    # servicio systemd corriendo como 'deploy'
./svc.sh start
```

Detalles que importan:

- `self-hosted`, `Linux` y `X64` se agregan solas; en `--labels` va solo lo
  propio (`vm2`).
- `deploy` tiene shell `nologin`, asi que hay que usar `runuser -u deploy --`
  (o `sudo -u`), no `su`.
- El tarball son 216 MB; `installdependencies.sh` instala lo que .NET necesita.
- Para poder construir imagenes, `deploy` tiene que quedar en el grupo `docker`.
  Eso se hace al instalar el engine.

## Riesgo que hay que tener presente

**Un self-hosted runner ejecuta cualquier workflow del repo, y el usuario del
runner estara en el grupo `docker`, que equivale a root en VM2.** Es decir:
quien consiga que se ejecute un workflow (push a una rama con un `.github/workflows`
modificado, o un PR de fork si estuviera habilitado) obtiene root en la maquina
que aloja el registry y ejecuta los jobs de produccion.

Las tres mitigaciones, por orden de importancia:

1. Repos privados y **nunca** habilitar workflows de PRs de forks (paso 3).
2. Proteccion de rama sobre `main` (paso 6).
3. Un unico repo dado de alta en el runner (consecuencia directa del monorepo).

GitHub desaconseja explicitamente usar self-hosted runners en repositorios
publicos por este motivo.

## Consideracion de recursos

VM2 tiene 4 vCPU y 6 GB, y es la misma maquina que ejecuta los jobs del
pipeline. Construir 18 imagenes en cada push competiria con la produccion. En el
workflow hay que:

- Filtrar por `paths`, para construir solo el servicio que cambio.
- Limitar la concurrencia (`concurrency` a nivel de workflow) para no encadenar
  builds solapados.
- Programar la limpieza de la cache de build (`docker builder prune`) y el
  garbage collection del registry.
