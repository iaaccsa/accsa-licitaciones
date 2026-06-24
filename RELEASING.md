# Proceso de Release y Changelog

El sistema Licitaciones usa **una sola versión** (SemVer) compartida por los tres
repos (`accsa-licitaciones-ui`, `accsa-licitaciones-api`,
`accsa-licitaciones-services`) y **un solo changelog** unificado en este repo
(`accsa-licitaciones-ui/CHANGELOG.md`).

## Versionado (SemVer único)

`MAJOR.MINOR.PATCH`, aplicado al sistema completo:
- **MAJOR**: cambios incompatibles / rediseños grandes.
- **MINOR**: funcionalidad nueva compatible.
- **PATCH**: correcciones compatibles.

Una sola versión avanza para los tres repos en conjunto, aunque el cambio sea de
un solo proyecto.

### Fuentes de la versión (mantener sincronizadas)

| Repo | Archivo / lugar | Cómo se usa |
|------|-----------------|-------------|
| UI | `package.json` -> `version` | Se expone como `NEXT_PUBLIC_APP_VERSION` (`next.config.ts`); se muestra en el Footer (link a `/changelog`). |
| API | `app/core/config.py` -> `VERSION` | Se sirve en `GET /version`. |
| Services | `VERSION` (raíz del repo) | `COPY VERSION .` en cada Dockerfile; `global/supabase_logger.py` la lee y la anexa al `source` de cada evento (`ACA: service-x v<version>`). |

## Durante el desarrollo (en cada cambio)

Agregar las entradas al bloque **`[Unreleased]`** de `CHANGELOG.md`, bajo la
subsección del proyecto y el tipo:

```
## [Unreleased]
### accsa-licitaciones-ui
#### Added
- Agregar ...
### accsa-licitaciones-api
#### Fixed
- Corregir ...
### accsa-licitaciones-services
```

Reglas de redacción:
- Español, verbos en infinitivo ("Agregar", "Corregir", "Migrar", "Eliminar").
- Tipos: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Agrupar commits relacionados en una sola entrada. Omitir ruido (CI puro, typos en código).

Alternativa: invocar el agente `changelog-keeper` desde cualquiera de los 3 repos
al cerrar trabajo; lee su memoria de proyecto y actualiza la sección correcta del
archivo unificado.

## Al subir la versión (release)

1. **Elegir** la nueva versión `X.Y.Z` según SemVer del conjunto.
2. **Changelog**: mover el contenido de `[Unreleased]` a un nuevo bloque
   `## [X.Y.Z] - YYYY-MM-DD` (más reciente arriba). Dejar `[Unreleased]` vacío
   con las tres subsecciones de proyecto. No tocar `## Historial previo`.
3. **Bumpear las 3 fuentes** de versión a `X.Y.Z`:
   - `accsa-licitaciones-ui/package.json`
   - `accsa-licitaciones-api/app/core/config.py` (`VERSION`)
   - `accsa-licitaciones-services/VERSION`
4. **Commit** en cada repo.
5. **Tag** `vX.Y.Z` en cada repo (`git tag vX.Y.Z`).
6. **Push** de `main` + tags en los tres repos. Esto dispara los deploys:
   - **Services**: Azure Pipeline (`trigger: main`) rebuildea las 15 imágenes en
     paralelo, horneando el nuevo `VERSION`, y las pushea a ACR.
   - **API**: redeploy (Vercel) -> `GET /version` devuelve `X.Y.Z`.
   - **UI**: redeploy (Vercel) -> Footer y `/changelog` reflejan `X.Y.Z`.
7. **Verificar**:
   - Footer muestra `vX.Y.Z` y linkea a `/changelog`.
   - `GET /version` responde `{"version": "X.Y.Z"}`.
   - Eventos nuevos de services muestran `... vX.Y.Z` en `source`.

> Nota: la versión de services es **build-time**. Hasta que el pipeline no
> rebuildee y pushee las imágenes, los contenedores ACA siguen usando la versión
> de la imagen anterior.
