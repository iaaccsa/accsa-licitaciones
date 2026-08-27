# Arreglo 01 - La agrupacion de documentos se adelantaba a la clasificacion

Fecha: 2026-08-26. Proyecto tocado: **accsa-licitaciones-api** (solo backend).
Commit: `fix(orchestrator): wait for every parent before launching a step`.
Deploy: pendiente (push a main dispara el deploy de la API en Vercel).

## Tarjetas de Planner que cubre

| Tarjeta | id | Relacion |
|---|---|---|
| El sistema no muestra los nombres correspondientes solo se visualiza un Codigo | `P1hi6OYm40aVPDzcELqbKmQAHKWq` | **causa raiz**, esto es lo que faltaba |
| CP-42 - Aunque no tenga "Admisibles" se visualiza como aprobado y completado | `dV7rNbHwoUCiQgv3gKz4_2QAKOJh` | **parcial**: arregla el caso "termina verde sin nada evaluado". Falta el arreglo 02 (la vista `analyses_view` no expone `completion_reason`, asi que el cartel ambar nunca se muestra) |

## Que estaba pasando

El paso "Clasificacion de Documentos" depende de dos pasos previos: extraccion de
metadatos y extraccion de firmas digitales. El orquestador esperaba a los dos
solo para los pasos de una sola instancia; la clasificacion se abre en una
instancia por archivo, y para ese tipo de paso la espera no se aplicaba. Con lo
cual arrancaba en cuanto terminaba **el primero** de los dos padres.

Cuando las firmas terminaban antes que los metadatos (pasa cuando los PDF no
estan firmados: la extraccion de firmas es mucho mas rapida), la clasificacion
arrancaba sin ningun archivo con metadatos, se daba por terminada con cero
instancias y arrastraba a la agrupacion de documentos, que corria sobre archivos
todavia sin categoria. Resultado: el analisis se quedaba **sin pliego, sin
propuestas y sin nombre**, y como no hay propuestas, todos los pasos siguientes
tampoco tenian nada que hacer y el analisis terminaba en verde, "Completado".

El codigo que veia QA ("375da665") era ese analisis sin nombre.

### Evidencia en produccion

Analisis `0c8c577e` (17/08) y `38751fa1` (19/08), los dos con el mismo patron:

```
17:54:46  digital_signature_extractor  termina
17:54:49  BACKEND   "Started job service-documents-grouper"     <- se adelanta
17:54:51  file_metadata_extractor      "Metadata extraida para pliego_1338907.md"
17:54:55  BACKEND   "Started fan-out job service-documents-classifier"
```

Los dos terminaron con `is_success = true`, `generated_name = NULL`, **0 filas en
`proposals` y 0 en `tenders`**. En los analisis que si quedaron con nombre
(`e614d471`, `c58473f8`, `bf8c280d`) las firmas terminaron despues de los
metadatos y el orden fue el correcto. Explica todos los nombres vacios
intermitentes desde el 04/08.

## Que se cambio

Archivo: `accsa-licitaciones-api/app/services/job_orchestrator_service.py`

1. **La espera de padres se aplica a todos los pasos.** Estaba dentro de la rama
   de pasos de instancia unica; ahora corre al principio de `_launch_next_job`,
   antes de decidir si el paso se abre por archivo o por propuesta.
2. **Reserva atomica del paso tambien para los pasos que se abren en varias
   instancias.** Con la espera arreglada, los dos padres pueden pasar la puerta
   con milisegundos de diferencia; la reserva hace que solo uno lance el paso.
3. **Un paso que no tiene nada que procesar ya no se saltea los cortes del
   analisis.** Toda la logica posterior a completar un paso (cortes tempranos,
   pausa de revision, lanzamiento de los siguientes, cierre del analisis) quedo
   en un unico lugar, `_advance_after_step`, por el que ahora pasan tanto el
   aviso de un job que termina como el paso que se salteo por estar vacio. Un
   analisis sin propuestas se cierra con el motivo "sin propuestas admitidas" en
   vez de recorrer en falso toda la admisibilidad y terminar en verde.

## Como revisarlo

### En la aplicacion (QA)

1. Crear un analisis nuevo con un pliego y al menos una propuesta, **con PDFs sin
   firma digital** (es el caso que disparaba la carrera).
2. Esperar a la primera pausa. Al llegar, el analisis tiene que mostrar:
   - el nombre real de la licitacion, extraido del pliego (no un codigo, y
     tampoco "Analisis del <fecha>");
   - las propuestas detectadas en la seccion de Propuestas;
   - el pliego identificado en la seccion de Archivos, con su categoria.
3. Repetir con PDFs firmados digitalmente: mismo resultado.
4. Caso de control: un analisis con **solo pliego y ninguna propuesta** tiene que
   cerrarse indicando que no hubo propuestas admitidas, no quedar en verde como
   "Completado". Nota: el cartel ambar en la pantalla depende del arreglo 02.
5. Caso de control: un analisis normal completo tiene que seguir pausando en los
   cuatro puntos de revision de siempre y terminar en verde.

### En la base (para vos)

Sobre un analisis nuevo, ya terminado:

```sql
select a.slug, a.generated_name, a.completion_reason, a.is_success,
       (select count(*) from proposals p where p.analysis_id = a.id) as propuestas,
       (select count(*) from tenders t where t.analysis_id = a.id)   as pliegos
from analyses a
where a.slug = '<slug del analisis>';
```

`generated_name` no puede quedar en NULL, y `propuestas`/`pliegos` no pueden dar
0 si el analisis tenia esos documentos.

Y el orden de los pasos, que es lo que estaba mal:

```sql
select code, started_at, ended_at
from analysis_workflow_steps
where analysis_id = '<id>'
  and code in ('file_metadata_extractor','digital_signature_extractor',
               'documents_classifier','documents_grouper')
order by started_at;
```

`documents_classifier` tiene que empezar **despues** de que terminen los dos
extractores, y `documents_grouper` despues de que termine la clasificacion.

### Pruebas automatizadas hechas

Se manejo el orquestador real contra repositorios simulados, en cuatro
escenarios. Los tres primeros fallan con el codigo viejo y pasan con el arreglo;
el cuarto es control de regresion:

- **A** - las firmas terminan antes que los metadatos: la clasificacion espera a
  los dos padres, corre sobre los dos archivos y recien despues corre la
  agrupacion, una sola vez.
- **B** - analisis sin propuestas: corta en el chequeo de admisibilidad con
  motivo `no_admitted_proposals` y no lanza nada despues.
- **C** - control: con una propuesta admitida, el chequeo de admisibilidad sigue
  pausando para revision, sin cambios.
- **D** - control: pipeline completo con aprobacion automatica, 16 servicios,
  cada uno con la cantidad exacta de instancias y sin lanzamientos duplicados (el
  codigo viejo lanzaba la clasificacion 4 veces en este escenario).

## Texto para la tarjeta de Planner

> [2026-08-26] RESUELTO - vuelve a Pendiente Testing.
>
> Que estaba pasando: el paso que clasifica los documentos depende de otros dos
> (metadatos y firmas digitales) y arrancaba en cuanto terminaba el primero de
> los dos en vez de esperar a ambos. Cuando las firmas terminaban primero, la
> clasificacion se quedaba sin nada que clasificar y la agrupacion corria sobre
> documentos todavia sin categoria: el analisis terminaba sin pliego, sin
> propuestas y sin nombre, y por eso se mostraba el codigo. Los tres codigos
> citados en la tarjeta correspondian ademas a analisis que habian fallado antes
> de llegar a la etapa que asigna el nombre.
>
> Que se hizo: cada paso del analisis espera ahora a todos sus pasos previos y no
> puede lanzarse dos veces. Ademas, un paso que no tiene nada que procesar ya no
> se saltea las pausas de revision ni el cierre del analisis.
>
> Que verificar:
> 1. Crear un analisis nuevo con un pliego y al menos una propuesta, con PDFs sin
>    firma digital. Al llegar a la primera pausa tiene que verse el nombre real de
>    la licitacion, las propuestas detectadas y el pliego identificado en Archivos.
> 2. Repetir con PDFs firmados digitalmente: mismo resultado.
> 3. Caso de control: un analisis normal tiene que seguir pausando en los cuatro
>    puntos de revision y terminar en verde con sus resultados.
> 4. Caso de control: un analisis con solo pliego y ninguna propuesta tiene que
>    cerrarse indicando que no hubo propuestas admitidas, no quedar en verde.
