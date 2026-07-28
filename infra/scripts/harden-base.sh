set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# ROLE is supplied by the caller.

echo "== 16. Time zone =="
timedatectl set-timezone America/Montevideo
timedatectl show -p Timezone --value

echo "== 14. Persistent journald with a size cap =="
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

echo "== 11. Network and kernel sysctl =="
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
# Anti-spoofing
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
# No ICMP redirects, neither accepted nor sent: these VMs are not routers
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
# No source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
# Common noise and attacks
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

echo "== 9. Service user =="
if [ "$ROLE" = "app" ]; then SVC_USER=licitaciones; SVC_HOME=/opt/licitaciones; else SVC_USER=deploy; SVC_HOME=/opt/deploy; fi
if ! id "$SVC_USER" > /dev/null 2>&1; then
  useradd --system --create-home --home-dir "$SVC_HOME" --shell /usr/sbin/nologin "$SVC_USER"
fi
getent passwd "$SVC_USER"

echo "== 10. Narrowly scoped NOPASSWD sudo =="
if [ "$ROLE" = "app" ]; then
cat > /etc/sudoers.d/10-licitaciones-deploy <<'EOF'
# Licitaciones deployment automation (VM1 - app).
# Application units only; every other sudo still asks for a password.
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
# Licitaciones deployment automation (VM2 - services).
# Docker is not listed here: sysadmin uses the docker group once the engine is
# installed.
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
# Logs do not go through sudoers: sudo 1.9 rejects wildcards in command
# arguments, and granting journalctl unrestricted is equivalent to reading the
# whole journal as root. The systemd-journal group gives full read access
# without sudo.
usermod -aG systemd-journal sysadmin
echo "sysadmin groups: $(id -nG sysadmin)"

echo "== 12. auditd + sudo logging =="
# Ubuntu 26.04 ships sudo-rs: it supports neither 'Defaults logfile' nor
# log_input/log_output. Every sudo invocation already lands in syslog -> journal;
# auditd adds the kernel-level trace of root escalations and sensitive files.
rm -f /etc/sudoers.d/11-sudo-logging

apt-get install -y -qq auditd audispd-plugins > /dev/null
# zz- so augenrules loads it AFTER audit.rules, which starts with -D
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
echo "rules loaded: $(auditctl -l | wc -l)"

echo "== 13. unattended-upgrades: security only, no reboot =="
sed -i 's|^\(\s*\)"\${distro_id}:\${distro_codename}";|\1//      "${distro_id}:${distro_codename}";|' /etc/apt/apt.conf.d/50unattended-upgrades
cat > /etc/apt/apt.conf.d/52-licitaciones <<'EOF'
// Reboots are manual and scheduled: an automatic one can cut an analysis that
// is still running.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
apt-config dump | grep -E "Unattended-Upgrade::(Allowed-Origins|Automatic-Reboot)\b" | sed 's/^/  /'

echo "== 15. Remove snapd and unused services =="
apt-get purge -y -qq snapd > /dev/null 2>&1 || true
rm -rf /var/cache/snapd /root/snap 2>/dev/null || true
for u in ModemManager.service fwupd.service upower.service udisks2.service multipathd.service multipathd.socket; do
  systemctl disable --now "$u" > /dev/null 2>&1 || true
done
systemctl mask ModemManager.service > /dev/null 2>&1 || true
echo "running services now: $(systemctl list-units --type=service --state=running --no-legend | wc -l)"
free -m | awk '/Mem:/{print "  RAM used: "$3"MB / "$2"MB"}'
