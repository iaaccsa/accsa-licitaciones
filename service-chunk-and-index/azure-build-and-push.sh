#!/bin/bash
set -e

REGISTRY="$AZURE_REGISTRY_SERVER/licitaciones"
APP_NAME="service-chunk-and-index"
APP_TAG="latest"

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg QDRANT_URL="$QDRANT_URL" \
  --build-arg QDRANT_API_KEY="$QDRANT_API_KEY" \
  --build-arg API_URL_GET_FILES_FOR_RAG="$API_URL_GET_FILES_FOR_RAG" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$REGISTRY/$APP_NAME:$APP_TAG"

echo "Build and push complete for $APP_NAME!"
