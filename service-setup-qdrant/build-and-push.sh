#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="service-setup-qdrant"
APP_TAG="latest"

# Load environment variables
if [ -f ../env_vars ]; then
  set -a
  source ../env_vars
  set +a
else
  echo "Warning: ../env_vars file not found"
fi

# Build and push
docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg QDRANT_URL="$QDRANT_URL" \
  --build-arg QDRANT_API_KEY="$QDRANT_API_KEY" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..
docker push "$REGISTRY/$APP_NAME:$APP_TAG"
