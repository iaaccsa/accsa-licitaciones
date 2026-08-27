# Arreglo 04 - Un corte de conexion al lanzar un paso ya no mata el analisis

Fecha: 2026-08-26. Proyecto tocado: **accsa-licitaciones-api** (solo backend).
Commit: `fix(orchestrator): retry a job launch whose connection died`.
Deploy: pendiente (push a main dispara el deploy de la API en Vercel).

## Tarjeta de Planner que cubre

| Tarjeta | id | Relacion |
|---|---|---|
| Probar el nuevo limite de 45 MB por archivo al subir un analisis | `4UPSDXp5PEGKbksuAkhgkWQAFP0Z` | **desbloquea la prueba**: el limite funciona, lo que fallo fue otra cosa |

## Que estaba pasando

La prueba del limite de 45 MB fallo el 19/08, pero no por el tamano del archivo.

Analisis `ec6453b4`, 19/08 16:10, con `pliego_grande_11MB.pdf` (11,5 MB) y una
oferta:

- el navegador **acepto** el archivo (el limite nuevo de 45 MB esta vivo),
- se subio al almacenamiento y el primer paso lo proceso bien
  ("2 archivo(s) subidos e indexados correctamente"),
- y despues el analisis murio arrancando el paso siguiente:

```
converter | failed | Failed to start job service-files-converter-mistral:
('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))
```

Es la conexion con la infraestructura de Azure que ejecuta los trabajos, que se
corto antes de recibir respuesta. Sin reintento: un corte de un segundo se lleva
puesto el analisis entero.

La causa exacta esta en la biblioteca de Azure: reintenta una conexion cortada
solo en los metodos que considera seguros, y el que lanza un trabajo no esta en
esa lista. Todo lo demas que hace el sistema contra Azure si se reintentaba;
faltaba justo el lanzamiento.

Dato importante para la tarjeta: **el limite de 45 MB en si funciona**. El mismo
dia, el analisis `935a9ed4` subio 128 archivos, 1073 MB en total, y llego sin
problemas hasta la primera pausa.

## Que se cambio

Archivo: `accsa-licitaciones-api/app/services/job_orchestrator_service.py`

El lanzamiento de un trabajo ahora se hace pidiendo explicitamente que se
reintente ante una conexion cortada, con la espera progresiva que ya trae la
biblioteca. Pasa de 1 intento a 4.

Queda anotado en el codigo el motivo de aceptar el riesgo: lanzar un trabajo no
es una operacion repetible, asi que si el pedido llego a Azure justo antes de
cortarse, el reintento puede levantar un segundo contenedor. Eso cuesta computo,
no correccion: el segundo aviso de fin se descarta como duplicado y el analisis
avanza una sola vez. No reintentar, en cambio, cuesta el analisis completo.

## Como revisarlo

Este arreglo no se puede ver en la pantalla: solo se nota cuando la red falla.

### En la aplicacion (QA)

1. Rehacer la prueba de la tarjeta: subir un PDF de entre 10 y 45 MB con una
   oferta. Tiene que aceptarse y el analisis tiene que completarse con ese
   documento incluido.
2. Subir un PDF de mas de 45 MB: tiene que rechazarse en la zona de carga con el
   mensaje "Archivos no validos (solo .pdf, max. 45 MB): <nombre>".
3. El texto bajo la zona de carga tiene que decir "Hasta 500 archivos PDF (max.
   45 MB c/u)".
4. En /ayuda (Iniciar un analisis y Preguntas frecuentes) y en el chatbot tiene
   que decir 45 MB.
5. Si un analisis vuelve a fallar, reportar el id: el paso que fallo y el motivo
   quedan visibles en la pantalla del analisis, con el boton de reintentar.

Los puntos 2, 3 y 4 ya estan en el codigo desde el commit del 17/08; se
verificaron ahi mismo.

### Comprobado antes de commitear

Se ejecuto el lanzamiento real contra un transporte de prueba que corta siempre
la conexion, reproduciendo el mismo error de produccion, sin salir de la maquina:

| Llamada | Intentos |
|---|---|
| lanzar un trabajo, como estaba | 1 |
| lanzar un trabajo, con el cambio | 4 |
| consultar el estado (lo que ya se reintentaba) | 4 |

## Fuera de alcance

- **El otro fallo del 19/08 no es de esta tarjeta.** El analisis `2a11271d`, con
  68 archivos y 570 MB, murio en la extraccion con un error distinto
  ("Expecting value: line 1 column 1"), tras recibir un lote de 150 archivos. Eso
  pertenece a las tarjetas de subida masiva (TC-CLI), no al limite por archivo.
- **El ejecutor propio de la VM2** (el que se usa on-prem en vez de Azure) hace
  su pedido sin reintento, igual que estaba este. No se toco: no hay ningun caso
  observado y produccion hoy corre contra Azure.
- **Limite global de almacenamiento**: sigue pendiente confirmar en Supabase que
  el tope de subida por archivo sea mayor o igual a 45 MB (Storage > Settings).
  Los dos buckets no tienen tope propio, asi que rige el del proyecto, que por
  defecto es 50 MB. Un archivo de 11,5 MB subio bien, asi que no bloquea la
  prueba.

## Texto para la tarjeta de Planner

> [2026-08-26] La prueba se puede rehacer.
>
> Que paso el 19/08: el analisis con el PDF de 11 MB (ec6453b4) no fallo por el
> tamano. El navegador acepto el archivo, se subio bien y el primer paso lo
> proceso; el analisis murio despues, arrancando el paso siguiente, porque se
> corto la conexion con la infraestructura que ejecuta los trabajos y el sistema
> no reintentaba. Un corte de un segundo se llevaba puesto el analisis entero.
>
> Que se hizo: el arranque de cada paso ahora se reintenta ante un corte de
> conexion, igual que ya se reintentaban las demas llamadas. Pasa de un intento a
> cuatro, con espera progresiva.
>
> Dato a favor del limite nuevo: el mismo dia, otro analisis subio 128 archivos y
> 1073 MB en total y llego sin problemas hasta la primera pausa.
>
> Que verificar (los mismos puntos de la tarjeta):
> 1. Subir un PDF de entre 10 y 45 MB: debe aceptarse y el analisis debe
>    completarse con ese documento incluido.
> 2. Subir un PDF de mas de 45 MB: debe rechazarse en la zona de carga con el
>    mensaje "Archivos no validos (solo .pdf, max. 45 MB): <nombre>".
> 3. El texto bajo la zona de carga debe decir "Hasta 500 archivos PDF (max. 45 MB
>    c/u)".
> 4. /ayuda y el chatbot deben decir 45 MB.
> 5. Si vuelve a fallar, reportar el id del analisis: la pantalla ahora muestra el
>    paso que fallo, el motivo y un boton para reintentar desde ahi.
