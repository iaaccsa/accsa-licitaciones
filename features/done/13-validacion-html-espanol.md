# Feature 13 — Mensajes de validación HTML siempre en español

Cubre la tarjeta de Planner **CP-13** ("Al ingresar mail de forma errónea el
mensaje lo indica en inglés"), con el alcance extendido a **todos los campos del
sistema donde aplique validación nativa**, no solo el email del login.

Complejidad: **baja** (solo UI, sin API, sin services, sin DB).

Proyecto afectado: `accsa-licitaciones-ui` únicamente.

---

## Estado actual

Los formularios usan validación nativa del navegador (atributos `required`,
`type="email"`, `minLength`). Cuando la restricción falla, el navegador dibuja
su burbuja con **su propio texto, en el idioma del navegador**, no en el de la
aplicación. Chrome en inglés muestra "Please include an '@' in the email
address" aunque el documento declare `<html lang="es">`
(`src/app/layout.tsx:32`).

El tester asumió que ese texto lo controla la app. No es así hoy: no hay una
sola llamada a `setCustomValidity`, `onInvalid` ni `noValidate` en todo `src/`.

El schema zod del login es solo server-side (`src/app/api/auth/login/route.ts:6-9`)
y su fallo mapea a `invalid_credentials_format`, que el cliente no traduce: cae
en el `else` genérico (`src/app/login/page.tsx:47`). O sea, no se filtra inglés
de zod, pero tampoco hay mensaje en español para formato de email.

## Decisión cerrada

**Mantener la validación HTML nativa** y solo reemplazar el texto, vía
`setCustomValidity()`. No se pasa a `noValidate` con mensajes propios: eso
cambiaría el criterio pedido y es bastante más trabajo.

Consecuencia aceptada: la burbuja la sigue dibujando el navegador (su
tipografía, su posición, su autocierre no son estilizables). Lo que pasa a ser
nuestro y en español es **el texto**.

## Inventario de campos afectados

Estos son los únicos controles del sistema que hoy pueden disparar una burbuja
nativa. El inventario ya está verificado, no hay que volver a buscarlo.

| # | Archivo | Línea | Control | Restricciones |
|---|---------|-------|---------|---------------|
| 1 | `src/app/login/page.tsx` | 77-87 | email | `type="email"`, `required` |
| 2 | `src/app/login/page.tsx` | 93-102 | password | `required` |
| 3 | `src/app/auth/set-password/page.tsx` | 77-88 | nueva contraseña | `required`, `minLength={6}` |
| 4 | `src/app/auth/set-password/page.tsx` | 101-110 | confirmar contraseña | `required`, `minLength={6}` |
| 5 | `src/app/admin/config/users/page.tsx` | 177-186 | email de invitación | `type="email"`, `required` |
| 6 | `src/app/admin/review/audit/page.tsx` | 141 | fecha desde | `type="date"` (`badInput` con fecha parcial) |
| 7 | `src/app/admin/review/audit/page.tsx` | 145 | fecha hasta | `type="date"` (`badInput` con fecha parcial) |

**Fuera de alcance, y por qué:**

- `src/app/analyses/[id]/page.tsx:238` — el input de renombrar tiene
  `maxLength={200}`, pero `maxLength` **no** dispara validación: el navegador
  trunca la entrada y listo. `tooLong` solo aplica a valores seteados por
  código.
- `src/app/admin/config/infra-config/page.tsx:176`,
  `src/app/admin/config/prompts/page.tsx:191`,
  `src/components/docs-chat/DocsChatWidget.tsx`,
  `src/app/analyses/[id]/files/[fileId]/chat/page.tsx`,
  `src/components/ComplianceMatrix.tsx`, `src/components/AdmissibilityMatrix.tsx`,
  `src/components/StatusCheckSection.tsx`, `src/components/help/HelpView.tsx` —
  no tienen ninguna restricción nativa, así que nunca abren una burbuja. No
  agregar validación nueva a estos campos: está fuera del alcance de CP-13.
- `src/app/auth/confirm/page.tsx:65` — el form no tiene campos.

## Diseño

### Helper compartido

Archivo nuevo: `src/lib/form-validation.ts`.

Se justifica como helper (y no repetir el código inline) porque son 7 usos en 4
archivos.

Debe exportar:

1. `validationMessage(input: HTMLInputElement): string` — mapea el `ValidityState`
   a un mensaje en español. Cubrir, en este orden de precedencia:
   - `valueMissing` → "Completa este campo."
   - `typeMismatch` con `type="email"` → "Ingresa un correo electrónico válido."
   - `typeMismatch` con `type="url"` → "Ingresa una URL válida."
   - `typeMismatch` genérico → "El formato ingresado no es válido."
   - `tooShort` → usar `input.minLength` en el texto, p. ej.
     "Ingresa al menos 6 caracteres."
   - `tooLong` → usar `input.maxLength`.
   - `rangeUnderflow` / `rangeOverflow` → usar `input.min` / `input.max`.
   - `stepMismatch` → "Ingresa un valor válido."
   - `patternMismatch` → "El formato ingresado no es válido."
   - `badInput` → "Ingresa un valor válido."
   - fallback → "El valor ingresado no es válido."

2. Un objeto de props para hacer spread en cada input, con los dos handlers:
   - `onInvalid`: llama `setCustomValidity(validationMessage(e.currentTarget))`.
     Es el evento nativo `invalid`, corre justo antes de que el navegador dibuje
     la burbuja.
   - `onInput`: llama `setCustomValidity("")`.

Usar `onInput` para limpiar, **no** `onChange`. En React ambos se disparan sobre
el evento `input`, así que usar `onInput` deja intactos los `onChange` que ya
existen en cada página y el diff queda mínimo.

### Punto crítico

**Limpiar el `customValidity` es obligatorio, no opcional.** Un
`customValidity` no vacío hace que `checkValidity()` devuelva `false` de forma
permanente, aunque el valor ya sea correcto: sin el `onInput` que lo limpia, el
formulario deja de enviarse para siempre después del primer error. Es el error
clásico de esta técnica y hay que verificarlo explícitamente (ver Verificación,
caso 3).

### Aplicación

En cada uno de los 7 controles del inventario, hacer spread del objeto de props.
No tocar el `onChange`, el `value`, ni ninguna otra prop existente.

## Fuera de alcance explícito

- No pasar ningún formulario a `noValidate`.
- No agregar restricciones nuevas a campos que hoy no las tienen.
- No cambiar el criterio de validez del email. Chrome y Firefox validan
  `type="email"` con una regex laxa y `a@b` pasa; eso sigue igual. Un criterio
  más estricto es otro trabajo.
- No tocar los mensajes de error del servidor ni el mapa de errores de auth.
- No tocar `src/app/api/auth/login/route.ts`.

## Verificación

Correr `pnpm build` y `pnpm lint` en `accsa-licitaciones-ui`. Ambos deben pasar
limpios.

Casos manuales, con el navegador en **inglés** (si el navegador está en español
el bug no se ve y la prueba no vale nada):

1. `/login`: escribir `noesunmail` en Usuario y enviar. La burbuja debe decir
   "Ingresa un correo electrónico válido.", no "Please include an '@'...".
2. `/login`: dejar los dos campos vacíos y enviar. Debe decir "Completa este
   campo." en el primero.
3. **Regresión del `customValidity` pegado**: después del caso 1, corregir el
   email a uno válido, completar la contraseña y enviar. **El formulario tiene
   que enviarse.** Si no se envía, falta el `onInput` que limpia.
4. `/auth/set-password`: contraseña de 3 caracteres. Debe decir "Ingresa al
   menos 6 caracteres." Verificar que el texto de ayuda de `:89-92` sigue
   visible (no se toca).
5. `/admin/config/users`: email de invitación inválido, mismo comportamiento
   que el caso 1.
6. `/admin/review/audit`: fecha parcial en los campos de fecha, mensaje en
   español.

## Notas

- Al terminar, marcar CP-13 en `WIP.md` (sección Grupo E) y mover este archivo a
  `features/done/`.
- Id de la tarjeta en Planner: `c2L52ZffykuD5tS4_6k-CGQAA4nS`.
- CP-18 (toggle de ojito en los campos de contraseña) toca los mismos 3 inputs
  de contraseña, pero es otra tarjeta. No mezclarla acá.
