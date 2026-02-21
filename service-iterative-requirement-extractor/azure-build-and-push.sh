#!/bin/bash
set -e

REGISTRY="$AZURE_REGISTRY_SERVER/licitaciones"
APP_NAME="service-iterative-requirement-extractor"
APP_TAG="latest"

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  --build-arg LLAMA_CLOUD_API_KEY="$LLAMA_CLOUD_API_KEY" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg QDRANT_URL="$QDRANT_URL" \
  --build-arg QDRANT_API_KEY="$QDRANT_API_KEY" \
  --build-arg SERVICE_NAME="$APP_NAME" \
  -t "$REGISTRY/$APP_NAME:$APP_TAG" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$REGISTRY/$APP_NAME:$APP_TAG"

echo "Build and push complete for $APP_NAME!"
