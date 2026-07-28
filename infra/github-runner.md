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

### 5. Secretos

`Settings -> Secrets and variables -> Actions`. Se necesitan para el `docker
login` del workflow contra el registry local:

| Secreto | Valor |
|---------|-------|
| `REGISTRY_URL` | `localhost:5000` (el runner corre en la misma VM que el registry) |
| `REGISTRY_USER` | Usuario de escritura del `htpasswd` del registry |
| `REGISTRY_PASSWORD` | Su contrasena |

### 6. Proteger la rama

`Settings -> Branches -> Add rule` sobre `main`: pull request obligatorio antes
de mergear. Quien pueda escribir en `main` puede ejecutar codigo arbitrario en
VM2 (ver "Riesgo").

## Lo que se hace despues en VM2

Con la URL y el token del paso 4:

```bash
sudo -u deploy -H bash            # usuario de servicio ya creado
mkdir -p /opt/deploy/actions-runner && cd /opt/deploy/actions-runner
curl -o actions-runner.tar.gz -L <URL del tarball que muestra GitHub>
tar xzf actions-runner.tar.gz
./config.sh --url <URL del repo u organizacion> --token <TOKEN> \
            --name vm2-licitaciones --labels self-hosted,linux,x64,vm2 \
            --work /opt/deploy/_work --unattended
exit
sudo ./svc.sh install deploy      # servicio systemd corriendo como 'deploy'
sudo ./svc.sh start
```

El usuario `deploy` tiene que estar en el grupo `docker` para poder construir
imagenes. Eso se hace al instalar el engine.

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
