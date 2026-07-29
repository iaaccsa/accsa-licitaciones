set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# Deploys the app layer on VM1: the api and ui containers from the VM2 registry.
# The caller supplies every secret below; nothing is baked into the images.
#
#   SUPABASE_URL SUPABASE_KEY SUPABASE_SECRET_KEY QDRANT_URL QDRANT_API_KEY
#   BACKEND_API_KEY OPENAI_API_KEY GEMINI_API_KEY UPSTASH_REDIS_REST_URL
#   MAILGUN_API_KEY EXECUTOR_API_KEY
#
# Optional: SUPABASE_ARTIFACTS_BASE_URL, INVITE_ALLOWED_EMAIL_DOMAINS.

APP_DIR=/opt/licitaciones
COMPOSE_FILE=$APP_DIR/docker-compose.yml
API_ENV=$APP_DIR/.env.api
UI_ENV=$APP_DIR/.env.ui

VM1_IP=10.97.0.11
VM2_IP=10.97.0.12
REGISTRY=vm2:5000

echo "== required variables =="
missing=()
for name in SUPABASE_URL SUPABASE_KEY SUPABASE_SECRET_KEY QDRANT_URL \
            BACKEND_API_KEY OPENAI_API_KEY GEMINI_API_KEY \
            UPSTASH_REDIS_REST_URL MAILGUN_API_KEY EXECUTOR_API_KEY; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "  missing: ${missing[*]}" >&2
  exit 1
fi
echo "  all present"

install -d -m 750 -o licitaciones -g licitaciones "$APP_DIR"

echo "== names in /etc/hosts =="
grep -q "$VM2_IP" /etc/hosts || \
  printf '%s\tvm1\n%s\tvm2 registry.licitaciones.local\n' "$VM1_IP" "$VM2_IP" >> /etc/hosts
grep -E 'vm1|vm2' /etc/hosts | sed 's/^/  /'

echo "== api configuration =="
# Two env files rather than one shared: the ui container has no business holding
# the Supabase service key, the executor key or the provider credentials.
cat > "$API_ENV" <<EOF
APP_ENV=production

SUPABASE_URL=$SUPABASE_URL
SUPABASE_KEY=$SUPABASE_KEY
SUPABASE_ARTIFACTS_BASE_URL=${SUPABASE_ARTIFACTS_BASE_URL:-}

QDRANT_URL=$QDRANT_URL
QDRANT_API_KEY=${QDRANT_API_KEY:-}

BACKEND_API_KEY=$BACKEND_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
GEMINI_API_KEY=$GEMINI_API_KEY
UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL
MAILGUN_API_KEY=$MAILGUN_API_KEY

# Where the jobs on VM2 send their callbacks. Must be reachable from $VM2_IP,
# so never localhost: it is this VM's address on the published port.
SERVICE_API_BASE_URL=http://$VM1_IP:8000
FRONTEND_BASE_URL=http://$VM1_IP

# Jobs run on the VM2 executor. The six AZURE_* are deliberately absent: the
# Azure client is built on first use, so the API starts without them.
JOB_EXECUTOR=local
EXECUTOR_BASE_URL=http://$VM2_IP:8080
EXECUTOR_API_KEY=$EXECUTOR_API_KEY
EOF

echo "== ui configuration =="
# NEXT_PUBLIC_* are absent on purpose: they are build args baked into the browser
# bundle by build-ui.yml from /opt/deploy/ui-build.env on the runner, not runtime
# environment. Setting them here would have no effect.
cat > "$UI_ENV" <<EOF
NODE_ENV=production

# The ui reaches the api over the compose network, not the published port.
API_BASE_URL=http://api:8000
BACKEND_API_KEY=$BACKEND_API_KEY

API_HEALTH_PATH=/api/v1/health
API_HEALTH_SUPABASE_PATH=/api/v1/health/supabase
API_HEALTH_QDRANT_PATH=/api/v1/health/qdrant
API_HEALTH_AZURE_PATH=/api/v1/health/azure
API_ANALYSES_PATH=/api/v1/analyses
API_EVENTS_PATH=/api/v1/events/search
API_ORIGINAL_FILES_PATH=/api/v1/original-files/search
API_PROCESSED_FILES_PATH=/api/v1/processed-files/search
API_PROPOSALS_PATH=/api/v1/proposals/search
API_REQUIREMENTS_PATH=/api/v1/analysis-requirements
API_WORKFLOW_STEPS_PATH=/api/v1/workflow-steps/search
API_WORKFLOW_PHASES_PATH=/api/v1/workflow-phases/search
API_COMPLIANCE_RESULTS_PATH=/api/v1/compliance-results/search
API_PROPOSAL_ECONOMIC_OFFERS_PATH=/api/v1/proposal-economic-offers
API_QDRANT_POINTS=/api/v1/qdrant/points/search
API_TENDER_EVALUATION_TYPES_PATH=/api/v1/tender-evaluation-types
API_TENDER_CLASSIFICATIONS_PATH=/api/v1/tender-classifications
API_UPLOAD_TOKEN_PATH=/api/v1/upload-token
API_CHAT_PATH=/api/v1/chat
API_CHAT_HISTORY_PATH=/api/v1/chat/history
API_SETTINGS_PATH=/api/v1/settings
API_AUDIT_LOGS_PATH=/api/v1/audit-logs
API_PROMPTS_PATH=/api/v1/prompts

SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY
INVITE_ALLOWED_EMAIL_DOMAINS=${INVITE_ALLOWED_EMAIL_DOMAINS:-}
AUTH_DISABLED=false
EOF

chown licitaciones:licitaciones "$API_ENV" "$UI_ENV"
chmod 600 "$API_ENV" "$UI_ENV"
echo "  $API_ENV ($(stat -c '%a %U' "$API_ENV"), $(grep -c '=' "$API_ENV") keys)"
echo "  $UI_ENV ($(stat -c '%a %U' "$UI_ENV"), $(grep -c '=' "$UI_ENV") keys)"

echo "== compose file =="
cat > "$COMPOSE_FILE" <<'EOF'
# Both services publish on the specific IP: ports published by Docker bypass
# ufw, and without the explicit bind they would listen on every interface.
services:
  api:
    image: vm2:5000/licitaciones-api:latest
    container_name: licitaciones-api
    restart: always
    env_file: .env.api
    # Only VM2 needs to reach this: the browser never talks to the API, the ui
    # proxies everything server-side over the compose network. The DOCKER-USER
    # rule drops 8000 from anything other than 10.97.0.12.
    ports:
      - "10.97.0.11:8000:8000"

  ui:
    image: vm2:5000/licitaciones-ui:latest
    container_name: licitaciones-ui
    restart: always
    env_file: .env.ui
    depends_on:
      - api
    # Plain HTTP: TLS is terminated by the corporate proxy in front of this VM.
    ports:
      - "10.97.0.11:80:3000"
EOF
chown licitaciones:licitaciones "$COMPOSE_FILE"
echo "  $COMPOSE_FILE"

echo "== systemd unit =="
cat > /etc/systemd/system/licitaciones-app.service <<EOF
[Unit]
Description=Licitaciones app layer (api + ui)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStartPre=/usr/bin/docker compose pull -q
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable licitaciones-app > /dev/null 2>&1
systemctl restart licitaciones-app
echo "  $(systemctl is-enabled licitaciones-app) / $(systemctl is-active licitaciones-app)"

echo "== containers =="
docker compose -f "$COMPOSE_FILE" ps --format '  {{.Name}}  {{.Image}}  {{.Status}}'

echo "== checks =="
for i in $(seq 1 20); do
  curl -fsS -m 2 -H "X-API-Key: $BACKEND_API_KEY" "http://$VM1_IP:8000/api/v1/health" > /dev/null 2>&1 && break
  sleep 2
done
curl -fsS -H "X-API-Key: $BACKEND_API_KEY" "http://$VM1_IP:8000/api/v1/health" | sed 's/^/  api:      /'
echo ""
# The one that matters: proves VM1 reaches the executor on VM2 through the
# DOCKER-USER rule that only lets 10.97.0.11 in.
curl -fsS -H "X-API-Key: $BACKEND_API_KEY" "http://$VM1_IP:8000/api/v1/health/executor" | sed 's/^/  executor: /'
echo ""
curl -s -o /dev/null -w "  ui:       HTTP %{http_code}\n" "http://$VM1_IP:80/"
curl -s -o /dev/null -w "  api sin credenciales: HTTP %{http_code} (403 esperado)\n" "http://$VM1_IP:8000/api/v1/health"
