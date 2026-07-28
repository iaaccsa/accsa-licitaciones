set -euo pipefail
# ROLE llega como variable desde el invocador.

# Los puertos publicados por Docker entran por la cadena FORWARD y no pasan por
# ufw, asi que las reglas de ufw no los filtran. DOCKER-USER si se evalua antes
# que las reglas que genera Docker, y es el lugar soportado para esto.
cat > /usr/local/sbin/licitaciones-docker-firewall <<'EOF'
#!/bin/bash
set -e
add() {  # idempotente
  iptables -C DOCKER-USER "$@" 2>/dev/null || iptables -I DOCKER-USER 1 "$@"
}
case "$1" in
  services)
    # Registry: solo VM1. El DROP se inserta primero para que quede por debajo
    # del RETURN (iptables -I mete en la posicion 1).
    add -p tcp --dport 5000 -j DROP
    add -p tcp --dport 5000 -s 10.97.0.11 -j RETURN
    ;;
  app)
    # API: solo los callbacks de los jobs de VM2. La UI la consume por la red
    # interna de compose, no por el puerto publicado.
    add -p tcp --dport 8000 -j DROP
    add -p tcp --dport 8000 -s 10.97.0.12 -j RETURN
    ;;
esac
EOF
chmod 755 /usr/local/sbin/licitaciones-docker-firewall

cat > /etc/systemd/system/licitaciones-docker-firewall.service <<EOF
[Unit]
Description=Reglas DOCKER-USER de Licitaciones
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
echo "  servicio: $(systemctl is-enabled licitaciones-docker-firewall) / $(systemctl is-active licitaciones-docker-firewall)"
echo "  reglas DOCKER-USER:"
iptables -L DOCKER-USER -n --line-numbers | sed 's/^/    /'
