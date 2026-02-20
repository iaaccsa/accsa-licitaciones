#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="service-file-extractor"
APP_TAG="latest"

# Load environment variables
if [ -f ../.env.local ]; then
  set -a
  source ../.env.local
  set +a
else
  echo "Warning: ../.env.local file not found"
fi

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..
docker push "$REGISTRY/$APP_NAME:$APP_TAG"
