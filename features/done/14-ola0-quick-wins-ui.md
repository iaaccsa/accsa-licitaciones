# Feature 14 — Ola 0: cuatro quick wins de UI

Cubre cuatro tarjetas de Planner independientes entre si, agrupadas solo porque
todas son cambios chicos y exclusivos de `accsa-licitaciones-ui`:

- **CP-154** — propuesta rechazada sigue apareciendo en los resumenes.
- **CP-29** — editar el nombre del analisis obliga a retipearlo.
- **CP-113** — la lista de analisis no tiene busqueda ni ordenamiento.
- **CP-18** — los campos de contrasena no dejan ver lo escrito.

Complejidad: **baja** las cuatro. Solo UI. Sin API, sin services, sin DB.

Cada una es independiente: se pueden implementar y revisar por separado.

---

## CP-154 — Filtrar las propuestas rechazadas

### Estado actual

Rechazar una propuesta desde la vista de Admisibilidad escribe
`admissibility_status` en la propuesta y nada mas: no hay cascada. Las dos
vistas de resumen no filtran por ese campo, asi que la propuesta rechazada sigue
listada.

- **Resumen de Propuestas**: `src/components/ProposalsSummary.tsx:40` consume
  `useProposals` (`src/lib/use-proposals.ts:9-13`). El loop de render esta en
  `:76`. La interfaz `Proposal` del componente (`:7-13`) **no declara**
  `admissibility_status`, aunque la vista `proposals_view` de la base **si lo
  devuelve** (verificado en `accsa-licitaciones-api/DB-VIEWs.md:122`).
- **Comparativa de Ofertas Economicas**:
  `src/components/EconomicComparisonTable.tsx:24-38` trae las ofertas de
  `/api/analyses/[id]/economic-offers`, que filtra solo por analisis. Renderiza
  todo en `:106`. Ya joinea `proposals` para `label` y `provider_name`
  (`:107`, `:116`, `:119`), asi que tiene a mano el estado de cada propuesta.

### Diseño

Filtrar **en el cliente**, en los dos componentes. No tocar la API: los
endpoints son genericos y los consumen tambien las vistas de admin, asi que
filtrar del lado del servidor arriesga romper otros consumidores.

1. `ProposalsSummary.tsx`: agregar `admissibility_status` a la interfaz
   `Proposal` y excluir del listado las propuestas con estado `rechazada`.
2. `EconomicComparisonTable.tsx`: excluir las ofertas cuya propuesta asociada
   este `rechazada`, resolviendola por el join que ya existe.

Reglas del filtro, importantes para no esconder de mas:
- Excluir **solo** `admissibility_status === "rechazada"`.
- **No** excluir `null`, `undefined` ni "sin resolver": un analisis que todavia
  no llego a la admisibilidad, o que se corto antes, tiene todas las propuestas
  sin estado y debe seguir mostrandolas todas. Este es el punto que mas facil se
  rompe: si se filtra por `!== "admitida"` en vez de por `=== "rechazada"`, esas
  vistas quedan vacias para todos los analisis sin admisibilidad.
- Si al filtrar no queda ninguna fila, mostrar el vacio que cada componente ya
  maneja hoy. No inventar estados nuevos.

### Verificación

- Analisis con propuestas admitidas y rechazadas: las rechazadas no aparecen en
  Resumen de Propuestas ni en Comparativa de Ofertas Economicas.
- Rechazar una propuesta y volver: desaparece de las dos vistas.
- Analisis sin admisibilidad resuelta (todas con estado nulo): siguen
  apareciendo todas.

---

## CP-29 — Editar el nombre del analisis

### Estado actual

`src/app/analyses/[id]/page.tsx`:

- El input es controlado (`value={nameDraft}` + `onChange`, `:229-241`), asi que
  el texto **si** es editable una vez que hay algo escrito.
- El problema: el borrador se siembra solo desde `user_assigned_name`,
  `setNameDraft(analysis.user_assigned_name ?? "")` (`:115-119`). El titulo que
  se ve es `user_assigned_name || generated_name || slug` (`:266-268`), y como
  no hay campo de nombre al subir, en el caso normal (nombre puesto por la IA)
  `user_assigned_name` es NULL. Resultado: el lapiz abre una caja **vacia**, con
  el nombre actual solo como `placeholder` (`:239`), y hay que retipear todo.
- Segunda mitad de la queja: `:279-283` renderiza `generated_name` como
  subtitulo siempre que haya `user_assigned_name`, asi que despues de renombrar
  queda el nombre viejo abajo.

### Diseño

1. Sembrar `nameDraft` con **el nombre que se esta mostrando**, con la misma
   cadena de fallback que usa el titulo (`user_assigned_name`, si no
   `generated_name`, si no `slug`). Asi el lapiz abre la caja con el texto
   actual y se puede corregir una palabra sin rehacer el resto.
2. Eliminar el subtitulo con `generated_name` de `:279-283`.

No cambiar que se guarda: sigue persistiendo `user_assigned_name`.

### Verificación

- Analisis nombrado por la IA: el lapiz abre el input **con el nombre cargado**,
  seleccionable y corregible.
- Cambiar una palabra y guardar: persiste, y al recargar se ve el nombre nuevo.
- Despues de guardar no queda ningun nombre viejo debajo del titulo.
- El breadcrumb refleja el nombre nuevo (ya comparte la clave SWR).

---

## CP-113 — Busqueda y ordenamiento en la lista de analisis

### Estado actual

La lista principal es `/` (`src/app/page.tsx:7-25`; `/analyses` redirige a `/`,
`src/app/analyses/page.tsx:3-5`), y renderiza `src/components/AnalysisList.tsx`,
que no tiene ni input ni select ni control de orden. Solo tiene orden fijo por
`created_at` desc (`:88-91`), un split fijo en "En Curso" / "Completados"
(`:93-98`) y paginacion (`:100-105`, `:140-176`).

El backend no ofrece busqueda por nombre: `GET /` filtra solo por `created_by`
(`accsa-licitaciones-api/app/api/v1/endpoints/analyses.py:26-34`) y el proxy
`src/app/api/analyses/list/route.ts` solo pasa `scope`.

`src/app/admin/analyses/page.tsx` renderiza el mismo componente, asi que hereda
lo que se haga.

### Diseño

Todo **en el cliente**, dentro de `AnalysisList.tsx`. La lista ya se trae
completa y se pagina en cliente, asi que no hace falta tocar backend ni proxy.

1. **Buscador**: un input de texto que filtre por el nombre mostrado (misma
   cadena `user_assigned_name || generated_name || slug`). Sin distinguir
   mayusculas ni acentos. Placeholder en espanol, por ejemplo
   "Buscar por nombre...".
2. **Ordenamiento**: un select con, como minimo, mas recientes primero (el
   actual, que queda por defecto) y mas antiguos primero. Si se agrega orden por
   nombre, que sea alfabetico sobre el mismo nombre mostrado.
3. El filtro y el orden se aplican **antes** del split en "En Curso" /
   "Completados" y antes de paginar, para que la paginacion cuente lo filtrado.
4. Al cambiar la busqueda o el orden, **volver a la pagina 1**. Si no, se puede
   quedar en una pagina que ya no existe y la lista se ve vacia.
5. Si la busqueda no encuentra nada, mostrar un mensaje en espanol del estilo
   "No hay análisis que coincidan con la búsqueda", distinto del vacio de "no
   hay análisis todavía".

No persistir la busqueda ni el orden en la URL ni en storage: fuera de alcance.

### Verificación

- Buscar por una parte del nombre filtra las dos secciones.
- La busqueda ignora mayusculas y acentos.
- Cambiar el orden reordena, y cambiar busqueda u orden vuelve a la pagina 1.
- Sin coincidencias aparece el mensaje propio, no la lista vacia sin explicacion.
- La vista de admin (`/admin/analyses`) hereda lo mismo y sigue funcionando.

---

## CP-18 — Mostrar u ocultar la contrasena

### Estado actual

Tres campos, los tres con `type="password"` fijo:

- `src/app/login/page.tsx:93-102` — contrasena de ingreso.
- `src/app/auth/set-password/page.tsx:77-88` — nueva contrasena.
- `src/app/auth/set-password/page.tsx:101-110` — confirmar contrasena.

No hay ningun toggle en el proyecto (grep de `showPassword|EyeOff` en `src/`:
cero resultados).

### Diseño

Agregar a cada uno de los tres campos un boton de ojito que alterna
`type="password"` / `type="text"`, dentro del recuadro del input, alineado a la
derecha.

- Iconos `Eye` / `EyeOff` de `lucide-react`, que ya es la libreria de iconos del
  proyecto.
- El boton tiene que ser `type="button"`. Si queda como submit implicito,
  **envia el formulario al hacer click**; es el error tipico de este control.
- Estado independiente por campo: mostrar la contrasena nueva no debe destapar
  la de confirmacion.
- Accesibilidad: `aria-label` que alterne entre "Mostrar contraseña" y "Ocultar
  contraseña", y `tabIndex={-1}` para que el tabulado siga yendo del campo al
  boton de enviar y no se corte en el ojito.
- No romper el `autoComplete` existente de cada campo.
- Cuidar que el padding derecho del input deje lugar al icono y el texto no
  quede por debajo.
- Mantener el spread de `spanishValidationProps` que ya tienen los tres campos
  (feature 13). No quitarlo.

### Verificación

- En los tres campos, el ojito alterna entre texto visible y oculto.
- Hacer click en el ojito **no** envia el formulario.
- Mostrar una contrasena no afecta al otro campo de la misma pantalla.
- El login sigue funcionando con la contrasena visible.
- Se ve bien en tema claro y oscuro, y el texto no se superpone con el icono.

---

## Verificación global

`pnpm build` y `pnpm lint` en `accsa-licitaciones-ui`, los dos limpios.

## Notas

- Al terminar, borrar las cuatro tarjetas de `WIP.md` (no marcarlas) y mover
  este archivo a `features/done/`.
- Ids de Planner: CP-154 `pXHmsOlVp0uJjeR0dxIXB2QAOG-t`, CP-29
  `6fEcubCsHUShPBUY4IboGmQAMoqN`, CP-113 `jvqitmTSH0G-dyoa29S35WQAKO4j`, CP-18
  `WKY-ZaqYakOOQ9JHJXa8xWQAF2d1`.
- La otra mitad de CP-42 (el cartel de "terminado sin admisibles") y el resto de
  CP-150 quedan fuera: son de otras olas.
