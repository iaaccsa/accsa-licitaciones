set -euo pipefail
# SSH hardening. Idempotent. Runs as root:
#   { echo "$PASSWORD"; cat harden-ssh.sh; } | ssh <host> 'sudo -S -p "" bash -s'
#
# Safety net: if the timer is not cancelled within 3 minutes, it reverts itself.
# Cancel it after verifying a fresh connection:
#   sudo systemctl stop ssh-rollback.timer && sudo systemctl reset-failed ssh-rollback.timer
systemd-run --quiet --unit=ssh-rollback --on-active=180 \
  /bin/bash -c 'rm -f /etc/ssh/sshd_config.d/01-hardening.conf; sed -i "s|^#\+\s*PasswordAuthentication|PasswordAuthentication|" /etc/ssh/sshd_config.d/50-cloud-init.conf; systemctl restart ssh.socket ssh.service'

# 01- wins over 50-cloud-init.conf: sshd applies the first value it finds.
cat > /etc/ssh/sshd_config.d/01-hardening.conf <<'EOF'
# Licitaciones hardening. Takes precedence over 50-cloud-init.conf by lexical
# order.
# 1. Key authentication only
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
# 2. Root cannot log in over SSH (hypervisor console remains for rescue)
PermitRootLogin no
# 3. User allowlist
AllowUsers sysadmin
# 4. Session limits
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 0600 /etc/ssh/sshd_config.d/01-hardening.conf
sed -i 's|^PasswordAuthentication|#PasswordAuthentication|' /etc/ssh/sshd_config.d/50-cloud-init.conf

sshd -t && echo "sshd -t: configuration valid"
systemctl restart ssh.socket ssh.service
sshd -T | grep -E "^(passwordauthentication|permitrootlogin|allowusers|maxauthtries|logingracetime|clientaliveinterval|kbdinteractiveauthentication) " | sed 's/^/  /'
