# Arreglo 02 - El motivo del corte no llegaba a la pantalla

Fecha: 2026-08-26. Proyecto tocado: **base de datos** (vista `analyses_view`).
No hubo cambio de codigo: ni la API ni la interfaz necesitaron tocarse.
Commit: `fix(db): expose completion_reason through analyses_view`.
Deploy: **ya aplicado**. La migracion corre en la base, asi que el arreglo esta
vivo en produccion desde el momento en que se aplico, sin esperar ningun deploy.

## Tarjeta de Planner que cubre

| Tarjeta | id | Relacion |
|---|---|---|
| CP-42 - Aunque no tenga "Admisibles" se visualiza como aprobado y completado | `dV7rNbHwoUCiQgv3gKz4_2QAKOJh` | **completa la tarjeta**, junto con el arreglo 01 |

## Que estaba pasando

El arreglo original de CP-42 (13/08) tenia tres partes: el backend guarda el
motivo por el que un analisis termino sin resultados, la interfaz muestra un
cartel ambar en el detalle y un estado "Terminado sin resultados" en el listado.
Las tres estaban hechas y desplegadas. Faltaba la cuarta, invisible: la API no
lee la tabla `analyses` directamente, lee una vista (`analyses_view`), y esa
vista se quedo con la lista de columnas vieja. La columna nueva quedo afuera.

Resultado: el motivo se guardaba correctamente en la base, pero la API siempre
devolvia vacio, y la interfaz, que solo muestra el cartel cuando hay motivo, no
mostraba nada. El analisis seguia viendose "Completado" en verde.

### Evidencia en produccion

Analisis `87cedcf5`, del 19/08, uno de los que corrio QA:

- en la tabla: `completion_reason = 'no_admitted_proposals'`
- en la respuesta de la API antes del arreglo: `"completion_reason": null`

Habia dos analisis en ese estado, los dos de la sesion de QA del 19/08:
`87cedcf5` (sin propuestas admitidas) y `f1a5578c` (pliego sin requisitos de
admisibilidad).

## Que se cambio

Se recreo la vista `analyses_view` agregando `completion_reason` al final de la
lista de columnas. Migracion aplicada por MCP de Supabase:
`add_completion_reason_to_analyses_view`.

Detalle importante que quedo documentado en `accsa-licitaciones-api/DB-VIEWs.md`:
`CREATE OR REPLACE VIEW` **descarta las opciones de la vista**, y esta tenia
`security_invoker = true`, que hace que la vista respete los permisos de quien
consulta en vez de los del dueno. Se verifico despues de aplicar la migracion,
se detecto que se habia perdido y se restauro con una segunda migracion
(`restore_security_invoker_on_analyses_view`). La vista quedo como estaba.

`DB-VIEWs.md` tambien estaba desactualizado (le faltaban dos columnas anteriores
a esta); quedo al dia y con la advertencia de la opcion que se pierde.

## Como revisarlo

### En la aplicacion (QA)

No hace falta correr un analisis nuevo: los dos casos ya existen en produccion.

1. Abrir el analisis **87cedcf5**. La cabecera tiene que decir "Sin propuestas
   admitidas" en ambar, no "Completado" en verde, y debajo tiene que verse el
   cartel que explica que ninguna propuesta paso el chequeo, remitiendo a la
   vista de Admisibilidad.
2. Abrir el analisis **f1a5578c**. Tiene que decir "Sin requisitos de
   admisibilidad", con su propio cartel.
3. En el listado principal, esos dos analisis tienen que figurar como "Terminado
   sin resultados", con icono ambar.
4. Caso de control: cualquier analisis que llego al final con propuestas
   admitidas tiene que seguir mostrando "Completado" en verde y sin ningun
   cartel.

### Comprobacion directa (para vos)

```bash
curl -s "$API/api/v1/analyses/671edb9c-668d-4dcf-b9fd-077db7f0d906" \
  -H "X-API-Key: $BACKEND_API_KEY" | jq '{slug, is_success, completion_reason}'
```

Tiene que devolver `"completion_reason": "no_admitted_proposals"`. Antes del
arreglo devolvia `null`. Ya se verifico contra la API desplegada, tanto en el
detalle como en el listado (89 analisis, 2 con motivo de corte).

## Observacion aparte, no es parte de este arreglo

Al verificar los permisos de la vista se comprobo que la tabla `analyses` se
puede leer entera con la clave publica del navegador (la misma que la tarjeta de
seguridad del bucket `artifacts` menciona). No lo introduce este cambio, es el
estado actual, y la vista quedo igual que antes. Conviene sumarlo a esa tarjeta
de seguridad cuando se tome.

## Texto para la tarjeta de Planner

> [2026-08-26] RESUELTO - vuelve a Pendiente Testing.
>
> Que faltaba: el arreglo anterior guardaba bien el motivo por el que un analisis
> termina sin nada para evaluar, y la pantalla ya sabia mostrarlo, pero la
> consulta que alimenta al listado y al detalle no devolvia ese dato. Como la
> pantalla solo muestra el aviso cuando hay motivo, el analisis se seguia viendo
> como "Completado" en verde. Se corrigio esa consulta.
>
> Va junto con el otro arreglo de esta tanda: un analisis que se quedaba sin
> propuestas por un problema de orden en el procesamiento tampoco registraba
> motivo alguno. Los dos casos quedan cubiertos.
>
> Que verificar (no hace falta crear analisis nuevos):
> 1. Abrir el analisis 87cedcf5: la cabecera debe decir "Sin propuestas
>    admitidas" en ambar, con el cartel que lo explica debajo.
> 2. Abrir el analisis f1a5578c: debe decir "Sin requisitos de admisibilidad",
>    con su propio cartel.
> 3. En el listado principal esos dos deben figurar como "Terminado sin
>    resultados", con icono ambar.
> 4. CASO DE CONTROL: un analisis normal, terminado con propuestas admitidas,
>    debe seguir en verde como "Completado" y sin ningun cartel.
