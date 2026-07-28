set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== official Docker repository =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
CODENAME=${UBUNTU_CODENAME:-$VERSION_CODENAME}
# Docker may not publish the newest LTS codename yet; fall back to the last
# known one so the repository is never missing.
if ! curl -fsI "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release" > /dev/null 2>&1; then
  echo "  no repository for '${CODENAME}', using 'noble'"
  CODENAME=noble
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq

echo "== installing engine + compose =="
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null
systemctl enable --now docker > /dev/null 2>&1

echo "== daemon: bounded logs so they cannot fill the LV =="
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
systemctl restart docker

echo "== docker group =="
usermod -aG docker sysadmin
id deploy > /dev/null 2>&1 && usermod -aG docker deploy || true
id licitaciones > /dev/null 2>&1 && usermod -aG docker licitaciones || true

echo "== verification =="
docker --version | sed 's/^/  /'
docker compose version | sed 's/^/  /'
echo "  storage driver: $(docker info -f '{{.Driver}}')"
echo "  docker root: $(docker info -f '{{.DockerRootDir}}')  -> $(df -h --output=target,size,avail /var/lib/docker | tail -1)"
docker run --rm hello-world > /dev/null 2>&1 && echo "  hello-world check: OK" || echo "  hello-world check: FAILED"
docker rmi -f hello-world > /dev/null 2>&1 || true
