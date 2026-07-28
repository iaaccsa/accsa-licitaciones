# Hardening de las VMs

Aplicado el 2026-07-28 en **VM1 (10.97.0.11)** y **VM2 (10.97.0.12)**, ambas
Ubuntu 26.04 LTS. Las 16 medidas acordadas estan aplicadas y verificadas.

Scripts reproducibles e idempotentes en `scripts/`:

| Script | Contenido | Como se ejecuta |
|--------|-----------|-----------------|
| `harden-base.sh` | Medidas 9 a 16 | `{ echo "$PW"; echo "ROLE=app\|services"; cat harden-base.sh; } \| ssh <host> 'sudo -S -p "" bash -s'` |
| `harden-ssh.sh` | Medidas 1 a 4 | Igual, sin `ROLE`. Incluye timer de rollback a 3 min |
| `harden-firewall.sh` | Medidas 5 a 8 | Igual, con `ROLE`. Incluye timer de rollback a 4 min |

Los dos scripts con rollback crean un `systemd-run --on-active` que revierte el
cambio si no se cancela el timer. Cancelarlo solo despues de verificar una
**conexion nueva**.

## Medidas aplicadas

### Acceso SSH (1-4)

`/etc/ssh/sshd_config.d/01-hardening.conf`. El prefijo `01` es deliberado: sshd
aplica el **primer** valor que encuentra y `50-cloud-init.conf` traia
`PasswordAuthentication yes`. Ese fichero quedo ademas comentado.

| Medida | Valor |
|--------|-------|
| 1. Solo clave | `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitEmptyPasswords no` |
| 2. Root sin SSH | `PermitRootLogin no` |
| 3. Lista blanca | `AllowUsers sysadmin` |
| 4. Limites de sesion | `MaxAuthTries 3`, `LoginGraceTime 30`, `ClientAliveInterval 300`, `ClientAliveCountMax 2` |

Verificado: login por clave OK; login por contrasena rechazado
(`Permission denied (publickey)`).

**Consecuencia:** si se pierde `~/.ssh/accsa_vm_ed25519`, el unico acceso es la
consola del hipervisor con la contrasena de root de `vm-credentials.md`.

### Firewall (5-7)

`ufw` activo, `deny incoming` / `allow outgoing`, logging `low`.

| VM | Reglas |
|----|--------|
| VM1 | 22/tcp, 80/tcp, 443/tcp desde `10.97.0.0/28` |
| VM2 | 22/tcp desde `10.97.0.0/28`; 5000/tcp solo desde `10.97.0.11` |

Los puertos 80/443/5000 todavia no tienen nada escuchando; las reglas quedan
listas.

### fail2ban (8)

Jail `sshd` activo, `bantime 1h`, `findtime 10m`, `maxretry 5`,
`banaction = ufw`, con `ignoreip = 127.0.0.1/8 ::1 10.97.0.0/28`.

**Su valor efectivo hoy es nulo, a proposito.** Ver "El gateway hace SNAT" mas
abajo: sin la exclusion, un unico cliente con intentos fallidos banearia a todos
los usuarios de la VPN a la vez, incluido el acceso de administracion. Queda
instalado y configurado para el dia en que haya trafico con IP de origen real.

### Usuarios, privilegios y kernel (9-12)

| Medida | Detalle |
|--------|---------|
| 9. Usuarios de servicio | `licitaciones` (VM1, home `/opt/licitaciones`) y `deploy` (VM2, home `/opt/deploy`), ambos sistema y `/usr/sbin/nologin` |
| 10. sudo NOPASSWD acotado | `/etc/sudoers.d/10-licitaciones-deploy`: solo `systemctl start\|stop\|restart\|status` de las unidades de la app (y `nginx -t` en VM1). Todo lo demas sigue pidiendo contrasena |
| 11. sysctl + AppArmor | `/etc/sysctl.d/99-hardening.conf` (rp_filter, sin redirects, sin source routing, syncookies, log_martians, `kptr_restrict`, `dmesg_restrict`, `protected_*`). AppArmor activo con los perfiles por defecto de la distro |
| 12. auditd | Instalado y activo, 9 reglas en `/etc/audit/rules.d/zz-licitaciones.rules`: watches sobre sudoers, sshd_config, passwd/shadow/group/gshadow y regla `execve` de escalada a root. `max_log_file 20`, `num_logs 5` |

El prefijo `zz-` en las reglas de audit es necesario: `augenrules` concatena en
orden lexico y el `audit.rules` de la distro empieza con `-D`, que borraria unas
reglas cargadas antes.

**Los logs no van por sudoers.** `journalctl` completo se resolvio anadiendo
`sysadmin` al grupo `systemd-journal` (lectura total del journal sin sudo), que
es mas limpio que dar `journalctl` con NOPASSWD.

### Sistema (13-16)

| Medida | Detalle |
|--------|---------|
| 13. Updates | Solo origenes `-security` (se comento `"${distro_id}:${distro_codename}"` en `50unattended-upgrades`). `Automatic-Reboot false` en `/etc/apt/apt.conf.d/52-licitaciones`. Los reinicios son manuales |
| 14. journald | `Storage=persistent`, `SystemMaxUse=500M`, `SystemMaxFileSize=50M`, `MaxRetentionSec=1month` |
| 15. Superficie | `snapd` purgado (no habia ningun snap instalado). Deshabilitados `ModemManager` (ademas enmascarado), `fwupd`, `upower`, `udisks2`, `multipathd`. De 24 a 20 servicios activos |
| 16. Hora | Zona horaria `America/Montevideo`. NTP publico (chrony contra los servidores de Canonical), como se pidio |

`open-vm-tools` y `vgauth` se dejan intactos: los necesita el hipervisor.

## Hallazgos que cambiaron el plan

### El gateway hace SNAT de todo el trafico VPN

Las VMs ven **todas** las conexiones desde la VPN con IP de origen `10.97.0.1`
(el gateway), no la IP real del cliente. Consecuencias:

1. La regla 6 ("SSH solo desde 10.97.x y VPN") no puede afinarse mas alla de
   `10.97.0.0/28` desde la VM. Restringir por usuario o por IP real tiene que
   ser una **politica en el FortiGate**.
2. fail2ban queda neutralizado (ver arriba).
3. Cualquier futura regla "solo desde tal maquina" tiene el mismo limite, salvo
   entre VM1 y VM2, que se ven directamente en el `/28` sin NAT.

### Ubuntu 26.04 usa sudo-rs, no sudo clasico

La reescritura en Rust reemplaza a `sudo` desde Ubuntu 25.10 y tiene un
subconjunto de funciones. En concreto rechaza:

- **Comodines en argumentos de comando** (`journalctl -u nginx*` da
  `wildcards are not allowed in command arguments`).
- `Defaults logfile`, `log_year`, `log_input`, `log_output`.

Por eso el log de comandos privilegiados se apoya en syslog/journal (donde
sudo-rs escribe cada invocacion) mas auditd, y no en un `sudo.log` propio.

Nota util: un fichero invalido en `/etc/sudoers.d/` **no rompe** sudo en
sudo-rs; lo ignora con un warning. Aun asi, validar siempre con
`visudo -cf <fichero>`.

### ufw no filtra puertos publicados por Docker

Pendiente para cuando se instale Docker en VM2: `docker run -p` inserta reglas
en las cadenas `DOCKER`/`nat PREROUTING` que **se saltan las reglas de ufw**. El
registry publicado en 5000 quedaria accesible a toda la vLAN pese a la regla que
lo limita a `10.97.0.11`. Soluciones al llegar a esa fase:

- Publicar el puerto solo en la interfaz interna: `-p 10.97.0.12:5000:5000`, o
- Anadir las restricciones en la cadena `DOCKER-USER`, que si se evalua antes.

## Comprobacion rapida del estado

```bash
ssh vm1-app 'sudo ufw status verbose; sudo fail2ban-client status sshd; \
             sshd -T | grep -E "passwordauth|permitroot|allowusers"; \
             timedatectl; sudo auditctl -l | wc -l'
```
