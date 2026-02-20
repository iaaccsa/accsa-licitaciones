#!/bin/bash
set -e

REGISTRY="$AZURE_REGISTRY_SERVER"
APP_PATH="licitaciones"
APP_NAME="service-file-extractor"
APP_TAG="latest"

IMAGE="$REGISTRY/$APP_PATH/$APP_NAME:$APP_TAG"

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -t "$IMAGE" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$IMAGE"

echo "Build and push complete for $APP_NAME!"
