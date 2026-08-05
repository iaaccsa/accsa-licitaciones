set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# EXECUTOR_API_KEY is supplied by the caller. Deliberately distinct from the
# API's BACKEND_API_KEY: holding it only grants running an allowlisted image.

EXEC_DIR=/etc/licitaciones-executor
ENV_FILE=$EXEC_DIR/executor.env
LOG_DIR=/var/log/licitaciones-jobs
IMAGE=vm2:5000/licitaciones-executor:latest

install -d -m 700 "$EXEC_DIR"
install -d -m 755 "$LOG_DIR"

echo "== image =="
# The CI runner builds on this same daemon, so the image is already local. Root
# is not logged into the registry on VM2 (only the runner's 'deploy' user is),
# so there is no pull fallback here.
docker image inspect "$IMAGE" > /dev/null 2>&1 || {
  echo "  MISSING: $IMAGE. Run the 'build executor' workflow first." >&2
  exit 1
}
echo "  $IMAGE ($(docker image inspect -f '{{.Id}}' "$IMAGE" | cut -c8-19))"

echo "== configuration =="
cat > "$ENV_FILE" <<EOF
APP_ENV=production
EXECUTOR_API_KEY=$EXECUTOR_API_KEY
EXECUTOR_REGISTRY=vm2:5000
EXECUTOR_ALLOWED_SERVICES=service-file-extractor,service-files-converter-mistral,service-qdrant-by-file,service-file-metadata-extractor,service-digital-sig-extractor,service-documents-classifier,service-documents-grouper,service-admissibility-extractor,service-build-proposal-index,service-admissibility-matcher,service-admissibility-gate,service-tender-classifier,service-requirement-extractor,service-compliance-matcher,service-compliance-summarizer,service-economic-offer-extractor
EXECUTOR_MAX_CONCURRENCY=3
EXECUTOR_MAX_QUEUE=200
EXECUTOR_CPUS=1.0
EXECUTOR_MEMORY=1536m
EXECUTOR_JOB_TIMEOUT_SECONDS=21600
EXECUTOR_LOG_DIR=$LOG_DIR
EXECUTOR_LOG_RETENTION_DAYS=14
EXECUTOR_HISTORY_TTL_MINUTES=120
EOF
chmod 600 "$ENV_FILE"
echo "  $ENV_FILE ($(stat -c '%a' "$ENV_FILE"), $(grep -c . "$ENV_FILE") keys)"
echo "  $LOG_DIR ($(stat -c '%a' "$LOG_DIR"))"

echo "== systemd unit =="
cat > /etc/systemd/system/licitaciones-executor.service <<EOF
[Unit]
Description=Licitaciones job executor
After=docker.service
Requires=docker.service

[Service]
Restart=always
RestartSec=5
ExecStartPre=-/usr/bin/docker rm -f licitaciones-executor
# Published on the specific IP: ports published by Docker bypass ufw, and
# without the explicit bind it would listen on every interface. The complement
# is the DOCKER-USER rule for 8080 in docker-firewall.sh (VM1 only).
# The Docker socket is the security boundary here; the container never turns
# anything received over HTTP into docker run options beyond the env dict, and
# the image is derived from an allowlisted service name.
ExecStart=/usr/bin/docker run --rm --name licitaciones-executor \\
  -p 10.97.0.12:8080:8080 \\
  --env-file $ENV_FILE \\
  --add-host vm2:10.97.0.12 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v $LOG_DIR:$LOG_DIR \\
  $IMAGE
ExecStop=/usr/bin/docker stop licitaciones-executor

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable licitaciones-executor > /dev/null 2>&1
systemctl restart licitaciones-executor
sleep 5
echo "  $(systemctl is-enabled licitaciones-executor) / $(systemctl is-active licitaciones-executor)"

echo "== API check =="
curl -fsS -H "X-API-Key: $EXECUTOR_API_KEY" http://10.97.0.12:8080/health | sed 's/^/  /'
echo ""
curl -s -o /dev/null -w "  without credentials: HTTP %{http_code} (401 expected)\n" \
  http://10.97.0.12:8080/health
