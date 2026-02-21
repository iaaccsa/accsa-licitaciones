#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="service-verify-compliance"
APP_TAG="latest"

# Load environment variables
if [ -f ../.env.local ]; then
  set -a
  source ../.env.local
  set +a
else
  echo "Warning: ../.env.local file not found"
fi

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg COHERE_API_KEY="$COHERE_API_KEY" \
  --build-arg QDRANT_URL="$QDRANT_URL" \
  --build-arg QDRANT_API_KEY="$QDRANT_API_KEY" \
  --build-arg SERVICE_NAME="$APP_NAME" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$REGISTRY/$APP_NAME:$APP_TAG"

echo "Build and push complete for $APP_NAME!"
