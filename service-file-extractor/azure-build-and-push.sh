#!/bin/bash
set -e

REGISTRY="$AZURE_REGISTRY_SERVER"
APP_PATH="services"
APP_NAME="service-file-extractor"
APP_TAG="latest"

IMAGE="$REGISTRY/$APP_PATH/$APP_NAME:$APP_TAG"

echo "Building Docker image for $APP_NAME..."

docker build --platform linux/amd64 \
  --build-arg SUPABASE_URL="$SUPABASE_URL" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --build-arg SUPABASE_ARTIFACTS_BASE_URL="$SUPABASE_ARTIFACTS_BASE_URL" \
  --build-arg API_BASE_URL="$API_BASE_URL" \
  --build-arg API_KEY="$API_KEY" \
  --build-arg API_EVENTS_PATH="$API_EVENTS_PATH" \
  --build-arg API_PROPOSALS_PATH="$API_PROPOSALS_PATH" \
  --build-arg API_ANALYSES_PATH="$API_ANALYSES_PATH" \
  --build-arg API_FILES_PATH="$API_FILES_PATH" \
  --build-arg API_WORKFLOW_STEPS_PATH="$API_WORKFLOW_STEPS_PATH" \
  -t "$IMAGE" -f Dockerfile ..

echo "Pushing image to ACR..."
docker push "$IMAGE"

echo "Build and push complete for $APP_NAME!"
