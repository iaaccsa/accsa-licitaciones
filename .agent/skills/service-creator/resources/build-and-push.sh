#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="<SERVICE_NAME>"
APP_TAG="latest"

# Load environment variables
if [ -f ../env_vars ]; then
  set -a
  source ../env_vars
  set +a
else
  echo "Warning: ../env_vars file not found"
fi

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg SERVICE_NAME="$APP_NAME" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$REGISTRY/$APP_NAME:$APP_TAG"

echo "Build and push complete for $APP_NAME!"
