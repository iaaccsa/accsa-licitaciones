# Arreglo 03 - Largo maximo en los campos de inicio de sesion y de contrasena

Fecha: 2026-08-26. Proyecto tocado: **accsa-licitaciones-ui** (pantallas y rutas).
Commit: `fix(auth): cap the length of the login and password fields`.
Deploy: pendiente (push a main dispara el deploy de la interfaz en Vercel).

## Tarjeta de Planner que cubre

| Tarjeta | id | Relacion |
|---|---|---|
| CP-11 - No hay limite de campos al iniciar sesion y primer inicio no indica cual es el criterio de contrasena | `zJJYbPj2-kGXU2x26OCfKGQANHIx` | **completa la tarjeta**: faltaba la primera mitad |

## Que estaba pasando

La tarjeta reclama dos cosas y solo una estaba hecha.

- **El criterio de la contrasena** ya se habia resuelto el 13/08: el texto se
  muestra debajo del campo en la pantalla de primer acceso, antes de escribir
  nada.
- **El limite de largo de los campos nunca se toco.** Ni el correo ni la
  contrasena, en ninguna de las dos pantallas, tenian tope: se podia escribir o
  pegar un texto de cualquier tamano y se enviaba entero al proveedor de
  identidad. Verificado en el codigo: no habia un solo `maxLength` en las
  pantallas de inicio de sesion ni de creacion de contrasena, y las rutas del
  servidor solo validaban el minimo.

## Que se cambio

Se agrego un unico lugar con los limites, `src/lib/auth-limits.ts`, usado por las
dos pantallas y por las dos rutas del servidor, para que el navegador y el
servidor no puedan discrepar:

| Campo | Limite | Por que |
|---|---|---|
| Correo (inicio de sesion) | 254 | maximo de la norma de correo electronico (RFC 5321) |
| Contrasena (inicio de sesion) | 128 | tiene que aceptar la contrasena que la cuenta ya tenga, asi que va holgado |
| Contrasena nueva y su confirmacion | 72 | el algoritmo con el que se guarda la contrasena solo lee los primeros 72 caracteres, mas alla de eso no aporta nada |

Ademas:

- El texto del criterio en el primer acceso pasa de "Minimo 6 caracteres" a
  "Entre 6 y 72 caracteres", que ahora es el criterio completo.
- El mensaje de error de largo invalido dice lo mismo, en vez de hablar solo del
  minimo.
- Las rutas `/api/auth/login` y `/api/auth/set-password` rechazan el pedido si el
  largo se pasa, asi el limite no depende solo del navegador.

## Como revisarlo

### En la aplicacion (QA)

1. En la pantalla de inicio de sesion, intentar pegar un texto muy largo (por
   ejemplo 500 caracteres) en Usuario: el campo corta en 254 caracteres.
2. Lo mismo en Contrasena: corta en 128.
3. Iniciar sesion normalmente con un usuario valido: tiene que funcionar igual
   que siempre.
4. Entrar con el enlace de primer acceso enviado al correo. Debajo del campo
   tiene que leerse "Entre 6 y 72 caracteres. Se admiten letras (a-z, A-Z),
   numeros (0-9) y simbolos (por ejemplo ! @ # $ % & * - _)."
5. Intentar pegar mas de 72 caracteres en la contrasena nueva: corta en 72.
6. Ingresar una contrasena de menos de 6 caracteres: avisa "La contrasena debe
   tener entre 6 y 72 caracteres", en espanol, y no deja continuar.
7. Completar el alta con una contrasena valida: tiene que funcionar.

### Comprobado antes de commitear

Levantando la aplicacion en local:

- La pantalla de inicio de sesion se sirve con `maxLength=254` en el correo y
  `maxLength=128` en la contrasena.
- La pantalla de primer acceso se sirve con `minLength=6` y `maxLength=72` en los
  dos campos, y con el texto del criterio ya en "Entre 6 y 72 caracteres".
- Contra las rutas del servidor, salteando el navegador:

  | Pedido | Respuesta |
  |---|---|
  | login con contrasena de 200 caracteres | 400 `invalid_credentials_format` |
  | login con correo de 262 caracteres | 400 `invalid_credentials_format` |
  | crear contrasena de 100 caracteres | 400 `invalid_password_format` |
  | crear contrasena de 5 caracteres | 400 `invalid_password_format` |
  | crear contrasena de 12 caracteres | pasa la validacion y sigue al proveedor |

- Verificacion de tipos y lint de la interfaz sin errores.

## Fuera de alcance, para decidir

La pantalla de administracion que invita usuarios (`/admin/config/users`) tiene
un campo de correo sin tope, igual que tenian estos. No es lo que reporta la
tarjeta, que habla del inicio de sesion, asi que quedo sin tocar. Si se quiere,
es agregar el mismo limite de 254 en un solo lugar.

## Texto para la tarjeta de Planner

> [2026-08-26] RESUELTO - vuelve a Pendiente Testing.
>
> La tarjeta pedia dos cosas y solo estaba hecha una. El criterio de la
> contrasena ya se mostraba desde el 13/08. Faltaba el limite de largo de los
> campos: no habia ninguno, se podia pegar un texto de cualquier tamano y se
> enviaba entero.
>
> Que se hizo: los campos ahora tienen tope, tanto en la pantalla como en el
> servidor. Correo 254 caracteres, contrasena para ingresar 128, contrasena nueva
> 72. El texto del criterio pasa a decir "Entre 6 y 72 caracteres", que es el
> criterio completo, y el mensaje de error dice lo mismo.
>
> Que verificar:
> 1. En Iniciar sesion, pegar un texto de 500 caracteres en Usuario: debe cortar
>    en 254. Lo mismo en Contrasena: debe cortar en 128.
> 2. Iniciar sesion normalmente: sin cambios.
> 3. Entrar con el enlace de primer acceso: debajo del campo debe leerse "Entre 6
>    y 72 caracteres...".
> 4. Pegar mas de 72 caracteres en la contrasena nueva: debe cortar en 72.
> 5. Ingresar una contrasena de menos de 6 caracteres: debe avisar "La contrasena
>    debe tener entre 6 y 72 caracteres" y no dejar continuar.
> 6. Completar el alta con una contrasena valida: debe funcionar.
