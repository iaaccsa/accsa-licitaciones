# Cómo crear un nuevo release (sesión nueva, sin contexto)

Guía para una sesión fría cuyo único objetivo es **actualizar el changelog y subir
la versión** del sistema. No necesitás recordar los pasos: el proceso completo está
en `accsa-licitaciones-ui/RELEASING.md` y en la memoria del agente `changelog-keeper`.
Acá solo está el "cómo dispararlo".

## Contexto del sistema

- **Versión única** (SemVer) compartida por los 3 repos (`ui`, `api`, `services`).
- **Changelog unificado** en `accsa-licitaciones-ui/CHANGELOG.md`, agrupado por
  proyecto y por tipo.
- El changelog se arma desde los **commits** desde el último tag de cada repo.

## Requisito previo

Tus cambios tienen que estar **commiteados** en cada repo (tu flujo normal). Lo que
esté sin commitear no lo ve el `git log` y quedaría fuera del changelog.

## Pasos

1. Abrir Claude Code en la **raíz del monorepo**
   (`/Users/genry/workspace/accsa/licitaciones`), para que pueda leer/editar los 3
   repos.
2. Pegar el prompt de abajo.
3. Cuando Claude proponga la versión `X.Y.Z`, confirmar (te la pregunta con opciones
   MAJOR/MINOR/PATCH antes de tocar nada).

### Prompt completo (copiar/pegar)

```
Vamos a hacer un release del sistema. Leé accsa-licitaciones-ui/RELEASING.md.

1. En cada repo (ui, api, services) sacá los commits desde su último tag:
   git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:%s
2. Volcá todos esos cambios en el bloque [Unreleased] del changelog unificado
   (accsa-licitaciones-ui/CHANGELOG.md), agrupados por proyecto (### <repo>) y
   por tipo (#### Added/Changed/Fixed/...), en español/infinitivo, agrupando
   commits relacionados y omitiendo ruido de CI.
3. Proponéme la nueva versión X.Y.Z según SemVer y esperá que confirme.
4. Al confirmar, hacé el release completo: mover [Unreleased] a ## [X.Y.Z] - fecha,
   bumpear las 3 fuentes de versión, commit, tag vX.Y.Z y push de main + tags en
   los 3 repos.
```

### Prompt corto (si confiás en el default)

```
Hacé un release siguiendo accsa-licitaciones-ui/RELEASING.md: juntá los cambios
desde el último tag de los 3 repos en el changelog, proponé la nueva versión y
al confirmar ejecutá el release completo (bump, commit, tag, push).
```

## Qué hace Claude

- Descubre solo qué cambió (no depende de contexto previo): `git log <ultimo-tag>..HEAD`.
- Llena el `[Unreleased]` del changelog por proyecto y tipo.
- Te pregunta la versión y espera confirmación.
- Mueve `[Unreleased]` a `## [X.Y.Z] - fecha`, bumpea las 3 fuentes de versión, commitea,
  taguea `vX.Y.Z` y pushea `main` + tags en los 3 repos → dispara los deploys
  (Azure Pipeline rebuildea services; Vercel redeploya ui y api).

## Las 3 fuentes de versión

| Repo | Lugar |
|------|-------|
| ui | `package.json` -> `version` |
| api | `app/core/config.py` -> `VERSION` |
| services | `VERSION` (raíz del repo) |

## Notas

- No necesitás recordar el número de versión anterior: `git describe --tags --abbrev=0`
  lo resuelve. (Hoy el último tag de cada repo es `v2.0.0`.)
- Si hay cambios sin commitear en algún repo, decíselo a Claude y los commitea primero;
  si no, el changelog saldría incompleto.
- Criterio SemVer del conjunto: MAJOR = cambio incompatible, MINOR = feature compatible,
  PATCH = fix.
- La versión de services es build-time: recién aparece en los eventos cuando el Azure
  Pipeline rebuildea y pushea las imágenes (los ACA Jobs toman la nueva `:latest` en su
  próxima ejecución).

Detalle completo del proceso y reglas de redacción del changelog: `accsa-licitaciones-ui/RELEASING.md`.
