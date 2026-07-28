set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 5/6/7. ufw =="
# Red de seguridad: si en 4 minutos no cancelo el timer, ufw se apaga solo.
systemd-run --quiet --unit=ufw-rollback --on-active=240 /usr/sbin/ufw --force disable

ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
# El gateway hace SNAT: todo el trafico de la VPN llega como 10.97.0.1, dentro
# del /28. Afinar mas que esto tiene que hacerse en la politica del FortiGate.
ufw allow from 10.97.0.0/28 to any port 22 proto tcp comment 'SSH vLAN 97' > /dev/null
if [ "$ROLE" = "app" ]; then
  ufw allow from 10.97.0.0/28 to any port 80 proto tcp comment 'HTTP app' > /dev/null
  ufw allow from 10.97.0.0/28 to any port 443 proto tcp comment 'HTTPS app' > /dev/null
else
  ufw allow from 10.97.0.11 to any port 5000 proto tcp comment 'Registry solo desde VM1' > /dev/null
fi
ufw logging low > /dev/null
ufw --force enable > /dev/null
ufw status verbose | sed 's/^/  /'

echo "== 8. fail2ban =="
apt-get install -y -qq fail2ban > /dev/null
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
backend  = systemd
banaction = ufw
bantime  = 1h
findtime = 10m
maxretry = 5
# El FortiGate hace SNAT de toda la VPN a 10.97.0.1. Sin esta exclusion, un solo
# cliente con intentos fallidos banearia a TODOS los usuarios a la vez, incluido
# el acceso de administracion. Mientras el gateway no preserve la IP de origen,
# la proteccion real la dan la autenticacion solo-por-clave y la regla de ufw.
ignoreip = 127.0.0.1/8 ::1 10.97.0.0/28

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban > /dev/null 2>&1
sleep 2
fail2ban-client status sshd 2>/dev/null | sed 's/^/  /' || echo "  jail sshd no responde todavia"
