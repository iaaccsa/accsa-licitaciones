set -euo pipefail
# ROLE is supplied by the caller.

# Ports published by Docker enter through the FORWARD chain and never reach ufw,
# so ufw rules do not filter them. DOCKER-USER is evaluated before the rules
# Docker generates, and is the supported place for this.
cat > /usr/local/sbin/licitaciones-docker-firewall <<'EOF'
#!/bin/bash
set -e
add() {  # idempotent
  iptables -C DOCKER-USER "$@" 2>/dev/null || iptables -I DOCKER-USER 1 "$@"
}
case "$1" in
  services)
    # Registry: VM1 only. The DROP is inserted first so it ends up below the
    # RETURN (iptables -I inserts at position 1).
    add -p tcp --dport 5000 -j DROP
    add -p tcp --dport 5000 -s 10.97.0.11 -j RETURN
    # Job executor: VM1 only. Its API key alone would let anyone on the VPN run
    # an allowlisted image on this host.
    add -p tcp --dport 8080 -j DROP
    add -p tcp --dport 8080 -s 10.97.0.11 -j RETURN
    ;;
  app)
    # API: only the job callbacks from VM2. The UI reaches it over the internal
    # compose network, not through the published port.
    add -p tcp --dport 8000 -j DROP
    add -p tcp --dport 8000 -s 10.97.0.12 -j RETURN
    ;;
esac
EOF
chmod 755 /usr/local/sbin/licitaciones-docker-firewall

cat > /etc/systemd/system/licitaciones-docker-firewall.service <<EOF
[Unit]
Description=Licitaciones DOCKER-USER rules
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/licitaciones-docker-firewall $ROLE

[Install]
WantedBy=multi-user.target docker.service
EOF
systemctl daemon-reload
systemctl enable --now licitaciones-docker-firewall > /dev/null 2>&1
echo "  service: $(systemctl is-enabled licitaciones-docker-firewall) / $(systemctl is-active licitaciones-docker-firewall)"
echo "  DOCKER-USER rules:"
iptables -L DOCKER-USER -n --line-numbers | sed 's/^/    /'
