# Mailgun como SMTP custom de Supabase Auth

Cierra el item **0.2** de `feature-login.md` (postergado 2026-06-12). Hacer
ANTES de invitar usuarios en producción. Hoy las invitaciones salen por el
mail integrado de Supabase: funciona, pero con rate limit severo (~2-4
mails/hora) y remitente genérico `noreply@mail.app.supabase.io` - solo
aceptable para dev.

## 1. Prerequisitos en Mailgun

1. Cuenta Mailgun activa (ya existe).
2. **Dominio propio verificado** (Sending -> Domains -> Add domain), p.ej.
   `mg.arnaldocastro.com.uy` o el dominio raíz. El **sandbox domain NO sirve**:
   solo entrega a "authorized recipients".
3. Verificación = agregar registros DNS que Mailgun indica:
   - SPF (TXT): `v=spf1 include:mailgun.org ~all`
   - DKIM (TXT): clave que genera Mailgun (p.ej. `smtp._domainkey.mg...`)
   - Opcional MX + CNAME tracking (no necesarios para solo-envío, pero
     Mailgun los lista; los MX solo si se reciben mails en ese subdominio)
4. Esperar a que el dominio figure "Verified" en Mailgun (propagación DNS).
5. Credencial SMTP: Sending -> Domain settings -> SMTP credentials. Usuario
   default `postmaster@<dominio>`; el password se genera/resetea ahí mismo
   (Mailgun lo muestra una sola vez - guardarlo en gestor de contraseñas).

Ojo región: si el dominio se creó en región EU, el host SMTP es
`smtp.eu.mailgun.org`; región US -> `smtp.mailgun.org`.

## 2. Configurar en Supabase

Dashboard del proyecto `yeawvnrvnnbuiejvrzbt`
(https://supabase.com/dashboard/project/yeawvnrvnnbuiejvrzbt)
-> Authentication -> Emails -> SMTP Settings -> habilitar "Enable Custom SMTP":

| Campo | Valor |
|-------|-------|
| Host | `smtp.mailgun.org` (o `smtp.eu.mailgun.org` según región) |
| Port number | `587` (STARTTLS; alternativa `465` SSL) |
| Username | `postmaster@<dominio-mailgun>` |
| Password | password SMTP de Mailgun |
| Sender email | `no-reply@<dominio-verificado>` (debe ser del dominio verificado) |
| Sender name | `ACCSA Licitaciones` (o el que prefieras) |

Guardar. Alternativa sin dashboard: Management API
(`PATCH /v1/projects/{ref}/config/auth`, campos `smtp_host`, `smtp_port`,
`smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name`); el token
está en `.mcp.json` del workspace - así se hizo la FASE 0.

## 3. Subir rate limits de email

Con SMTP custom Supabase permite ajustar el límite (con el integrado está
clavado bajo): Authentication -> Rate Limits -> "Rate limit for sending
emails". Subir de ~2/h a algo razonable (p.ej. 30/h; las invitaciones son de
bajo volumen).

## 4. Lo que NO hay que tocar

- Template "Invite user": ya configurado en FASE 0 con el flujo
  `token_hash` (`/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password`).
- Site URL / Redirect URLs: ya configurados
  (`https://accsa-licitaciones-ui.vercel.app` + localhost).
- Código de la UI: cero cambios; el SMTP es transparente para la app.

## 5. Verificación post-configuración (cierra resto de 2.3)

1. Login como administrator en la UI -> `/admin/users` -> invitar un email
   real del dominio permitido (`INVITE_ALLOWED_EMAIL_DOMAINS=arnaldocastro.com.uy`).
2. Verificar que el mail LLEGA (revisar spam la primera vez), remitente =
   sender configurado.
3. Click en "Aceptar invitación" -> debe llevar a `/auth/set-password` con
   sesión -> setear password -> entra a la app.
4. Si falla la entrega: Mailgun -> Sending -> Logs muestra cada intento
   SMTP (accepted/delivered/failed con motivo); Supabase -> Auth logs del
   lado emisor.
5. Marcar 0.2 como `[x]` en `feature-login.md` y anotar entrega real
   verificada en 2.3.

## Estado actual (2026-06-12)

- Mail integrado de Supabase activo; invitaciones funcionan en dev.
- Flujo invite completo ya verificado e2e sin mail (ver `feature-login.md`
  FASE 4); lo único que valida este paso es la entrega real del correo.
