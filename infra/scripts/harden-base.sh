set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 16. Zona horaria =="
timedatectl set-timezone America/Montevideo
timedatectl show -p Timezone --value

echo "== 14. journald persistente con limite =="
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-licitaciones.conf <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=500M
SystemMaxFileSize=50M
MaxRetentionSec=1month
EOF
systemctl restart systemd-journald
echo "ok"

echo "== 11. sysctl de red y kernel =="
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
# Anti-spoofing
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
# Sin redirects ICMP (ni aceptar ni enviar): estas VMs no son routers
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
# Sin source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
# Ruido y ataques comunes
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
# Kernel
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.protected_fifos = 2
fs.protected_regular = 2
EOF
sysctl --system > /dev/null
echo "rp_filter=$(sysctl -n net.ipv4.conf.all.rp_filter) syncookies=$(sysctl -n net.ipv4.tcp_syncookies)"

echo "== 11b. AppArmor =="
systemctl enable --now apparmor.service > /dev/null 2>&1 || true
aa-status 2>/dev/null | head -1

echo "== 9. Usuario de servicio =="
if [ "$ROLE" = "app" ]; then SVC_USER=licitaciones; SVC_HOME=/opt/licitaciones; else SVC_USER=deploy; SVC_HOME=/opt/deploy; fi
if ! id "$SVC_USER" > /dev/null 2>&1; then
  useradd --system --create-home --home-dir "$SVC_HOME" --shell /usr/sbin/nologin "$SVC_USER"
fi
getent passwd "$SVC_USER"

echo "== 10. sudo NOPASSWD acotado =="
if [ "$ROLE" = "app" ]; then
cat > /etc/sudoers.d/10-licitaciones-deploy <<'EOF'
# Automatizacion de despliegue de Licitaciones (VM1 - app).
# Solo las unidades de la aplicacion; cualquier otro sudo sigue pidiendo password.
Cmnd_Alias LIC_UNITS = /usr/bin/systemctl start licitaciones-api.service, \
                       /usr/bin/systemctl stop licitaciones-api.service, \
                       /usr/bin/systemctl restart licitaciones-api.service, \
                       /usr/bin/systemctl status licitaciones-api.service, \
                       /usr/bin/systemctl start licitaciones-ui.service, \
                       /usr/bin/systemctl stop licitaciones-ui.service, \
                       /usr/bin/systemctl restart licitaciones-ui.service, \
                       /usr/bin/systemctl status licitaciones-ui.service, \
                       /usr/bin/systemctl reload nginx.service, \
                       /usr/bin/systemctl restart nginx.service, \
                       /usr/bin/systemctl status nginx.service
Cmnd_Alias LIC_CHECK = /usr/sbin/nginx -t
sysadmin ALL=(root) NOPASSWD: LIC_UNITS, LIC_CHECK
EOF
else
cat > /etc/sudoers.d/10-licitaciones-deploy <<'EOF'
# Automatizacion de despliegue de Licitaciones (VM2 - servicios).
# Docker no va aqui: sysadmin usara el grupo docker cuando se instale el engine.
Cmnd_Alias LIC_UNITS = /usr/bin/systemctl start docker.service, \
                       /usr/bin/systemctl stop docker.service, \
                       /usr/bin/systemctl restart docker.service, \
                       /usr/bin/systemctl status docker.service, \
                       /usr/bin/systemctl start licitaciones-registry.service, \
                       /usr/bin/systemctl stop licitaciones-registry.service, \
                       /usr/bin/systemctl restart licitaciones-registry.service, \
                       /usr/bin/systemctl status licitaciones-registry.service, \
                       /usr/bin/systemctl start licitaciones-executor.service, \
                       /usr/bin/systemctl stop licitaciones-executor.service, \
                       /usr/bin/systemctl restart licitaciones-executor.service, \
                       /usr/bin/systemctl status licitaciones-executor.service
sysadmin ALL=(root) NOPASSWD: LIC_UNITS
EOF
fi
chmod 0440 /etc/sudoers.d/10-licitaciones-deploy
visudo -cf /etc/sudoers.d/10-licitaciones-deploy
# Los logs no van por sudoers: sudo 1.9 rechaza comodines en argumentos y dar
# journalctl sin restriccion equivale a leer todo el journal como root. El grupo
# systemd-journal da acceso de lectura completo sin sudo.
usermod -aG systemd-journal sysadmin
echo "grupos de sysadmin: $(id -nG sysadmin)"

echo "== 12. auditd + log de sudo =="
# Ubuntu 26.04 usa sudo-rs: no soporta 'Defaults logfile' ni log_input/log_output.
# Cada invocacion de sudo ya queda en syslog -> journal; auditd anade la traza
# a nivel kernel de las escaladas a root y de los ficheros sensibles.
rm -f /etc/sudoers.d/11-sudo-logging

apt-get install -y -qq auditd audispd-plugins > /dev/null
# zz- para que augenrules lo cargue DESPUES de audit.rules (que empieza con -D)
cat > /etc/audit/rules.d/zz-licitaciones.rules <<'EOF'
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d/ -p wa -k sudoers
-w /etc/ssh/sshd_config -p wa -k sshd
-w /etc/ssh/sshd_config.d/ -p wa -k sshd
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/gshadow -p wa -k identity
-a always,exit -F arch=b64 -S execve -C uid!=euid -F euid=0 -k priv_esc
EOF
sed -i 's/^max_log_file = .*/max_log_file = 20/; s/^num_logs = .*/num_logs = 5/' /etc/audit/auditd.conf
augenrules --load > /dev/null
systemctl enable --now auditd > /dev/null 2>&1 || true
echo "reglas cargadas: $(auditctl -l | wc -l)"

echo "== 13. unattended-upgrades: solo security, sin reboot =="
sed -i 's|^\(\s*\)"\${distro_id}:\${distro_codename}";|\1//      "${distro_id}:${distro_codename}";|' /etc/apt/apt.conf.d/50unattended-upgrades
cat > /etc/apt/apt.conf.d/52-licitaciones <<'EOF'
// Los reinicios son manuales y programados: un reboot automatico puede cortar
// un analisis en curso.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
apt-config dump | grep -E "Unattended-Upgrade::(Allowed-Origins|Automatic-Reboot)\b" | sed 's/^/  /'

echo "== 15. Quitar snapd y servicios sin uso =="
apt-get purge -y -qq snapd > /dev/null 2>&1 || true
rm -rf /var/cache/snapd /root/snap 2>/dev/null || true
for u in ModemManager.service fwupd.service upower.service udisks2.service multipathd.service multipathd.socket; do
  systemctl disable --now "$u" > /dev/null 2>&1 || true
done
systemctl mask ModemManager.service > /dev/null 2>&1 || true
echo "servicios activos ahora: $(systemctl list-units --type=service --state=running --no-legend | wc -l)"
free -m | awk '/Mem:/{print "  RAM usada: "$3"MB / "$2"MB"}'
