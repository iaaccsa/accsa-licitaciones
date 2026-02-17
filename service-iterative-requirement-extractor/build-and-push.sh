#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="service-iterative-requirement-extractor"
APP_TAG="latest"

# Load environment variables
if [ -f ../env_vars ]; then
  set -a
  source ../env_vars
  set +a
else
  echo "Warning: ../env_vars file not found"
fi

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg LLAMA_CLOUD_API_KEY="$LLAMA_CLOUD_API_KEY" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg QDRANT_URL="$QDRANT_URL" \
  --build-arg QDRANT_API_KEY="$QDRANT_API_KEY" \
  --build-arg SERVICE_NAME="$APP_NAME" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..
docker push "$REGISTRY/$APP_NAME:$APP_TAG"
