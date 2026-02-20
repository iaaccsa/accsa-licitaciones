#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/services"
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

docker build --no-cache --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg SUPABASE_ARTIFACTS_BASE_URL="$SUPABASE_ARTIFACTS_BASE_URL" \
  --build-arg API_BASE_URL="$API_BASE_URL" \
  --build-arg API_KEY="$API_KEY" \
  --build-arg API_EVENTS_PATH="$API_EVENTS_PATH" \
  --build-arg API_PROPOSALS_PATH="$API_PROPOSALS_PATH" \
  --build-arg API_ANALYSES_PATH="$API_ANALYSES_PATH" \
  --build-arg API_FILES_PATH="$API_FILES_PATH" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

# docker push "$REGISTRY/$APP_NAME:$APP_TAG"
