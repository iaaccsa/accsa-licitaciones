#!/bin/bash
set -e

REGISTRY="$AZURE_REGISTRY_SERVER/licitaciones"
APP_NAME="service-files-converter"
APP_TAG="latest"

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg LLAMA_CLOUD_API_KEY="$LLAMA_CLOUD_API_KEY" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$REGISTRY/$APP_NAME:$APP_TAG"

echo "Build and push complete for $APP_NAME!"
