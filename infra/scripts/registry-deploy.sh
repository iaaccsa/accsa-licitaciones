set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# PIPELINE_PW and VM1_PW are supplied by the caller.

REG_DIR=/etc/licitaciones-registry
CERT_DIR=$REG_DIR/certs
AUTH_DIR=$REG_DIR/auth
install -d -m 700 "$REG_DIR" "$CERT_DIR" "$AUTH_DIR"

echo "== names in /etc/hosts =="
grep -q 'registry.licitaciones.local' /etc/hosts || \
  printf '10.97.0.11\tvm1\n10.97.0.12\tvm2 registry.licitaciones.local\n' >> /etc/hosts
grep -E 'vm1|vm2' /etc/hosts | sed 's/^/  /'

echo "== internal CA + registry certificate =="
if [ ! -f "$CERT_DIR/ca.crt" ]; then
  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
    -subj "/C=UY/O=ACCSA/CN=ACCSA Licitaciones Internal CA" 2>/dev/null
  echo "  CA created (10 years)"
fi
if [ ! -f "$CERT_DIR/registry.crt" ]; then
  cat > "$CERT_DIR/san.cnf" <<'EOF'
[req]
distinguished_name = dn
[dn]
[ext]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:vm2, DNS:registry.licitaciones.local, DNS:localhost, IP:10.97.0.12, IP:127.0.0.1
EOF
  openssl req -newkey rsa:4096 -nodes -sha256 \
    -keyout "$CERT_DIR/registry.key" -out "$CERT_DIR/registry.csr" \
    -subj "/C=UY/O=ACCSA/CN=vm2" 2>/dev/null
  openssl x509 -req -in "$CERT_DIR/registry.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -out "$CERT_DIR/registry.crt" -days 1825 -sha256 \
    -extfile "$CERT_DIR/san.cnf" -extensions ext 2>/dev/null
  rm -f "$CERT_DIR/registry.csr"
  echo "  registry certificate created (5 years)"
fi
chmod 600 "$CERT_DIR"/*.key
openssl x509 -in "$CERT_DIR/registry.crt" -noout -ext subjectAltName | tail -1 | sed 's/^/  SAN:/'

echo "== htpasswd =="
apt-get install -y -qq apache2-utils > /dev/null
htpasswd -Bbc "$AUTH_DIR/htpasswd" pipeline "$PIPELINE_PW" 2>/dev/null
htpasswd -Bb  "$AUTH_DIR/htpasswd" vm1 "$VM1_PW" 2>/dev/null
chmod 600 "$AUTH_DIR/htpasswd"
echo "  users: $(cut -d: -f1 "$AUTH_DIR/htpasswd" | tr '\n' ' ')"

echo "== registry image =="
IMG=registry:3
docker pull -q "$IMG" > /dev/null 2>&1 || IMG=registry:2
docker pull -q "$IMG" > /dev/null
echo "  using $IMG"

echo "== systemd unit =="
cat > /etc/systemd/system/licitaciones-registry.service <<EOF
[Unit]
Description=Licitaciones private Docker registry
After=docker.service
Requires=docker.service

[Service]
Restart=always
RestartSec=5
ExecStartPre=-/usr/bin/docker rm -f licitaciones-registry
# Published on the specific IP: ports published by Docker bypass ufw, and
# without the explicit bind it would listen on every interface.
ExecStart=/usr/bin/docker run --rm --name licitaciones-registry \\
  -p 10.97.0.12:5000:5000 \\
  -v licitaciones-registry-data:/var/lib/registry \\
  -v $CERT_DIR:/certs:ro \\
  -v $AUTH_DIR:/auth:ro \\
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/registry.crt \\
  -e REGISTRY_HTTP_TLS_KEY=/certs/registry.key \\
  -e REGISTRY_AUTH=htpasswd \\
  -e REGISTRY_AUTH_HTPASSWD_REALM="Licitaciones Registry" \\
  -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \\
  -e REGISTRY_STORAGE_DELETE_ENABLED=true \\
  $IMG
ExecStop=/usr/bin/docker stop licitaciones-registry

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now licitaciones-registry > /dev/null 2>&1
sleep 5
echo "  $(systemctl is-enabled licitaciones-registry) / $(systemctl is-active licitaciones-registry)"

echo "== trust the CA (VM2) =="
install -d /etc/docker/certs.d/vm2:5000
cp "$CERT_DIR/ca.crt" /etc/docker/certs.d/vm2:5000/ca.crt
cp "$CERT_DIR/ca.crt" /usr/local/share/ca-certificates/accsa-licitaciones-ca.crt
update-ca-certificates > /dev/null 2>&1

echo "== API check =="
curl -fsS -u "pipeline:$PIPELINE_PW" https://vm2:5000/v2/_catalog | sed 's/^/  /'
curl -s -o /dev/null -w "  without credentials: HTTP %{http_code} (401 expected)\n" https://vm2:5000/v2/_catalog
