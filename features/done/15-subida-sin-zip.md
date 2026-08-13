# Feature 15 — Ola 1: subida por archivo, sin ZIP en el navegador

Cubre las tarjetas **TC-CLI-118/127**, **TC-CLI-121**, **TC-CLI-126**,
**CP-155** y **CP-51/32**, y habilita el re-test de **ID 212**. Las cinco salen
de la misma causa raiz.

Complejidad: **media-alta**. Toca UI, API y un service.

---

## Estado actual, verificado

1. `src/components/UploadSection.tsx:48-56`: el navegador arma un ZIP con los N
   PDFs **en memoria** (`jszip`, `await file.arrayBuffer()` por archivo, despues
   `generateAsync({type:"blob"})`). Sin compresion util: el ZIP pesa la suma de
   los PDFs y el pico de memoria es ~2x el total.
2. `UploadSection.tsx:63-73`: un unico `fetch` sube el ZIP a
   `artifacts/{uuid}.zip` con la anon key. Sin progreso, sin reintento, sin
   `AbortController`.
3. `UploadSection.tsx:81-89`: recien despues se crea el analisis con
   `storage_path = "{uuid}.zip"`, que la API guarda en `analyses.artifact_path`
   (`app/services/analysis_service.py:31`).
4. `service-file-extractor/main.py:301-321`: baja el ZIP **entero a RAM**
   (`requests.get(url, timeout=300).content`) dentro de un contenedor limitado a
   1536 MB, lo escribe a disco y lo descomprime.
5. `service-file-extractor/main.py:101-176` (`upload_and_index_files`): recorre
   lo descomprimido y **vuelve a subir cada PDF uno por uno** a
   `files/<slug>/<file_id>.pdf`, insertando una fila en `files` por cada uno.

**La observacion que ordena todo el rediseno:** los PDFs terminan igual como
objetos individuales en Storage. El ZIP no es el destino, es un sobre de
transporte que se descarta. Cuesta el doble de bytes transferidos, un job de
CPU, y es lo que agota la memoria de la pestana. Cuando el tab muere por OOM el
`try/catch` de `:103` **no lo captura**, y de ahi el sintoma "el boton
desaparece y no pasa nada".

Decidido: **no se usa TUS**. Se recomienda para objetos de mas de 6 MB con
chunks de 6 MB; subiendo archivo por archivo cada objeto es un PDF de 10 MB como
maximo, asi que la subida normal alcanza y la granularidad de reintento pasa a
ser un PDF. TUS agregaria una dependencia sin beneficio real aca.

Se mantiene a proposito que `service-file-extractor` sea quien lee de
`artifacts/` y escribe en `files/`: mas adelante ese mismo service va a recibir
ZIPs subidos por el usuario y descomprimirlos, y este diseno le deja el lugar
natural para hacerlo.

---

## Contrato entre las dos mitades

Esta es la parte que **no se puede cambiar de un lado sin el otro**.

- El navegador genera un `batchId` (uuid v4).
- Sube cada PDF a `artifacts/{batchId}/{NNNN}.pdf`, donde `NNNN` es el indice
  con 4 digitos y ceros a la izquierda, empezando en `0000`. Se usa el indice y
  no el nombre original para no depender de saneado de nombres ni de
  colisiones.
- Cuando **todos** los PDFs terminaron, y solo entonces, sube el manifiesto a
  `artifacts/{batchId}/manifest.json`:

```json
{
  "version": 1,
  "files": [
    { "key": "0000.pdf", "name": "Pliego general.pdf", "size": 123456 },
    { "key": "0001.pdf", "name": "Anexo I.pdf", "size": 98765 }
  ]
}
```

- El manifiesto es el **marcador de commit**: se sube ultimo, de modo que un
  lote incompleto nunca tiene manifiesto y el extractor puede distinguirlo.
- Recien despues el navegador hace `POST /api/analyses` con
  `storage_path = "{batchId}/"` (con barra final, relativo al bucket
  `artifacts`, igual que hoy es relativo).

El orden importa: si el navegador muere a mitad de la subida no se crea ningun
analisis, exactamente como hoy cuando falla el ZIP. Quedan objetos huerfanos en
`artifacts/`, tambien como hoy. Limpiarlos queda fuera de alcance.

---

## Parte A — Interfaz (`accsa-licitaciones-ui`)

### A1. `UploadSection.tsx`: subida por archivo

- Eliminar `jszip` por completo, incluido el `import` dinamico. Sacar la
  dependencia de `package.json` si no la usa nadie mas (verificar con grep).
- Subir los archivos con **concurrencia limitada a 5**. No lanzar 500 `fetch` a
  la vez.
- **Reintento por archivo**: hasta 3 intentos con espera de 0, 1 y 3 segundos.
  Si un archivo agota los intentos, abortar el lote y mostrar un error que
  **nombre el archivo que fallo**. Nada de mensajes genericos.
- Cada PUT usa el mismo endpoint y credenciales que hoy
  (`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/artifacts/...`, anon key,
  `Content-Type: application/pdf`).
- **Progreso real**: reemplazar el spinner "Enviando..." por texto del estilo
  "Subiendo 137 de 420 archivos" mas una barra de porcentaje. Al terminar la
  subida y mientras se crea el analisis, "Iniciando el análisis...".
- Mientras la subida esta en curso, deshabilitar el boton y la zona de carga.

### A2. Validaciones antes de empezar

Hoy no hay ninguna validacion de tamano total: con 500 x 10 MB permitidos, una
seleccion legal llega a ~5 GB.

- Agregar limite de **tamano total del lote**, configurable con
  `NEXT_PUBLIC_MAX_UPLOAD_TOTAL_MB`, valor por defecto **2048**.
- Si se supera, no empezar la subida y mostrar un mensaje que diga el tamano del
  lote y el maximo permitido.
- Agregar la variable a `.env.example` con un comentario.
- Nota: el limite de 1 GB por objeto de Storage **deja de aplicar**, porque el
  objeto mas grande pasa a ser un PDF de 10 MB. Este limite nuevo es una
  decision de politica, no una restriccion tecnica.

### A3. `FileUploadZone.tsx`: truncado silencioso

`FileUploadZone.tsx:80` descarta con `slice(0, maxFiles)` todo lo que pase del
maximo, sin decir nada. Mostrar un aviso cuando se descarten archivos,
indicando cuantos quedaron fuera.

### A4. La subida cuenta como actividad

`InactivityWatcher.tsx` solo escucha eventos de mouse, teclado y scroll, asi que
una subida larga desatendida se corta sola a los 30 minutos con un redirect a
`/login?reason=timeout` (`:51-58`).

- En `src/lib/session-timeout.ts` exportar el nombre de un evento propio,
  `APP_ACTIVITY_EVENT = "app:activity"`, y un helper `signalActivity()` que haga
  `window.dispatchEvent(new Event(APP_ACTIVITY_EVENT))`.
- Agregar ese nombre al array `ACTIVITY_EVENTS` de `InactivityWatcher.tsx`. No
  cambiar nada mas del watcher.
- Llamar `signalActivity()` desde el bucle de subida cada vez que termina un
  archivo. El `HEARTBEAT_INTERVAL_MS` que ya existe evita que esto genere una
  peticion por archivo.

### A5. `Dockerfile`

Declarar `NEXT_PUBLIC_MAX_UPLOAD_FILES` y la nueva
`NEXT_PUBLIC_MAX_UPLOAD_TOTAL_MB` como `ARG`/`ENV`, junto a las otras seis
`NEXT_PUBLIC_*` de las lineas 16-28. Hoy la primera falta, y como estas se
inlinean en build time, el limite "configurable" queda fijo en el fallback en
todos los contenedores.

---

## Parte B — Backend (`accsa-licitaciones-api` y `service-file-extractor`)

### B1. API: el prefijo

- `app/services/analysis_service.py:31` sigue guardando `data.storage_path` en
  `artifact_path`. No hace falta cambiar el codigo, pero **si** revisar que
  nada valide que termine en `.zip`. `artifact_path` solo se usa en 3 lugares en
  todo el monorepo (`schemas/analysis.py:42`, `analysis_service.py:31`,
  `service-file-extractor/main.py:290-302`).

### B2. API: dejar de tragarse el fallo de arranque

`app/services/analysis_service.py:65-68` captura las excepciones de
`start_pipeline()` y solo las loguea; el endpoint igual devuelve 200. La
interfaz muestra "Análisis iniciado con éxito" mientras el analisis queda
`pending` para siempre. Es una causa independiente de TC-CLI-121.

- Que el fallo se propague al cliente con un mensaje util, o como minimo que el
  analisis quede marcado como fallido con el motivo registrado. No dejar el
  estado mentiroso.

### B3. `service-file-extractor`: leer el prefijo en vez del ZIP

Reemplazar los pasos 4 a 7 (`main.py:301-336`), que hoy bajan el ZIP a RAM, lo
escriben y lo descomprimen.

Flujo nuevo:

1. Descargar `artifacts/{prefijo}manifest.json`. Si no existe, fallar con un
   mensaje claro de lote incompleto. **No** intentar adivinar listando el
   prefijo: la ausencia del manifiesto significa que la subida no termino.
2. Recorrer `files` del manifiesto y, **de a un archivo por vez**:
   - descargar `artifacts/{prefijo}{key}` **en streaming a disco**
     (`requests.get(..., stream=True)` e ir escribiendo por chunks), nunca
     `.content` completo a memoria;
   - validar con el `pdf_rejection_reason` que ya existe, registrando el mismo
     evento de omitido que hoy;
   - subir a `files/<slug>/<file_id>.pdf` e insertar la fila, reutilizando la
     logica actual de `upload_and_index_files`;
   - **borrar el temporal antes de pasar al siguiente**, para que el disco se
     mantenga plano en un archivo a la vez en vez de crecer hasta 5 GB.
3. `file_name` de la fila en `files` debe ser el **`name` del manifiesto**, no
   el `key`. Si se usa el key, todos los documentos se llamarian `0000.pdf` en
   la interfaz. Este es el punto que mas facil se rompe.
4. Conservar sin cambios: `cleanup_previous_run`, el guard `NoValidPdfError`
   cuando no queda ningun PDF valido, los eventos de inicio y fin, y el
   `PATCH .../status` a `processing`.
5. Se puede quitar el `import zipfile` si deja de usarse.

Efecto lateral buscado: se ahorra bajar y volver a subir todos los bytes, asi
que el paso arranca mas rapido y gasta menos.

---

## Fuera de alcance

- **La duracion del analisis no cambia.** La conversion OCR sigue siendo un
  proceso secuencial, asi que un lote de cientos de archivos va a seguir
  tardando horas. Esto arregla la subida, no el tiempo de proceso. Conviene
  decirselo a QA para que no lo reporten como la misma falla.
- Limpieza de objetos huerfanos en `artifacts/`.
- Reanudar una subida cortada en un analisis ya creado.
- La escritura anonima al bucket `artifacts`, que tiene tarjeta propia en
  Pendiente Desarrollo.
- Subida de archivos ZIP por parte del usuario: es una etapa posterior, y este
  diseno la deja natural de agregar en este mismo service.

---

## Verificación

- `pnpm build` y `pnpm lint` en la interfaz, los dos limpios.
- La API importa sin errores.
- Lote chico (2-3 PDFs) de punta a punta: sube, crea el analisis, el extractor
  lo procesa y los documentos aparecen **con su nombre original** en la vista de
  archivos.
- Lote con dos PDFs de igual nombre en carpetas distintas: los dos sobreviven,
  hoy uno pisa al otro.
- Lote grande simulado: el progreso avanza y la pestana no se traba.
- Cortar la red a mitad de la subida: reintenta y, si agota los intentos,
  informa que archivo fallo.
- Superar el tamano total: mensaje claro, no empieza la subida.
- Seleccionar mas archivos que el maximo: avisa cuantos quedaron fuera.

## Notas

- Al terminar, borrar de `WIP.md` las tarjetas resueltas y mover este archivo a
  `features/done/`.
- Ids de Planner: TC-CLI-118/127 `gvcDB19NyEqupL2mU792e2QAGsED`, TC-CLI-121
  `SLQWMVwJokq8f34f36-vz2QAIntE`, TC-CLI-126 `V8t7zujHMEu4GcIIim4lB2QAPNv-`,
  CP-155 `31Fy4ecE1kqR1l4W3NIRfmQACi_g`, CP-51/32
  `C0_tUop0Zkeo6zHtSSX6D2QAHaZQ`, ID 212 `CtuhIdGXmEav-6-Q1get8WQAKtgU`.
