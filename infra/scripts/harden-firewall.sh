set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# ROLE is supplied by the caller.

echo "== 5/6/7. ufw =="
# Safety net: if the timer is not cancelled within 4 minutes, ufw turns itself
# off again.
systemd-run --quiet --unit=ufw-rollback --on-active=240 /usr/sbin/ufw --force disable

ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
# The gateway does SNAT: every VPN connection arrives as 10.97.0.1, inside the
# /28. Anything finer than this has to be a FortiGate policy.
ufw allow from 10.97.0.0/28 to any port 22 proto tcp comment 'SSH vLAN 97' > /dev/null
if [ "$ROLE" = "app" ]; then
  ufw allow from 10.97.0.0/28 to any port 80 proto tcp comment 'HTTP app' > /dev/null
  ufw allow from 10.97.0.0/28 to any port 443 proto tcp comment 'HTTPS app' > /dev/null
else
  ufw allow from 10.97.0.11 to any port 5000 proto tcp comment 'Registry from VM1 only' > /dev/null
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
# The FortiGate SNATs the whole VPN to 10.97.0.1. Without this exclusion, a
# single client with failed attempts would ban EVERY user at once, including
# administrative access. Until the gateway preserves the source IP, the real
# protection comes from key-only authentication and the ufw rule.
ignoreip = 127.0.0.1/8 ::1 10.97.0.0/28

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban > /dev/null 2>&1
sleep 2
fail2ban-client status sshd 2>/dev/null | sed 's/^/  /' || echo "  sshd jail not responding yet"
