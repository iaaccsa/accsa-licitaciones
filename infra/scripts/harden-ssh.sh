set -euo pipefail
# Endurecimiento de SSH. Idempotente. Se ejecuta como root:
#   { echo "$PASSWORD"; cat harden-ssh.sh; } | ssh <host> 'sudo -S -p "" bash -s'
#
# Red de seguridad: si en 3 minutos no se cancela el timer, se revierte solo.
# Cancelar tras verificar una conexion nueva:
#   sudo systemctl stop ssh-rollback.timer && sudo systemctl reset-failed ssh-rollback.timer
systemd-run --quiet --unit=ssh-rollback --on-active=180 \
  /bin/bash -c 'rm -f /etc/ssh/sshd_config.d/01-hardening.conf; sed -i "s|^#\+\s*PasswordAuthentication|PasswordAuthentication|" /etc/ssh/sshd_config.d/50-cloud-init.conf; systemctl restart ssh.socket ssh.service'

# 01- gana sobre 50-cloud-init.conf: sshd aplica el primer valor que encuentra.
cat > /etc/ssh/sshd_config.d/01-hardening.conf <<'EOF'
# Hardening Licitaciones. Prevalece sobre 50-cloud-init.conf por orden lexico.
# 1. Solo autenticacion por clave
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
# 2. Root no entra por SSH (queda la consola del hipervisor para rescate)
PermitRootLogin no
# 3. Lista blanca de usuarios
AllowUsers sysadmin
# 4. Limites de sesion
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 0600 /etc/ssh/sshd_config.d/01-hardening.conf
sed -i 's|^PasswordAuthentication|#PasswordAuthentication|' /etc/ssh/sshd_config.d/50-cloud-init.conf

sshd -t && echo "sshd -t: config valida"
systemctl restart ssh.socket ssh.service
sshd -T | grep -E "^(passwordauthentication|permitrootlogin|allowusers|maxauthtries|logingracetime|clientaliveinterval|kbdinteractiveauthentication) " | sed 's/^/  /'
