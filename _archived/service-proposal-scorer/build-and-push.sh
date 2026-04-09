#!/bin/bash
set -e

ENV_TYPE=$1

if [[ "$ENV_TYPE" != "local" && "$ENV_TYPE" != "azure" ]]; then
  echo "Usage: $0 [local|azure]"
  exit 1
fi

APP_NAME="service-proposal-scorer"
APP_TAG="latest"
APP_PATH="services"
REGISTRY="accsalicitaciones.azurecr.io"
IMAGE="$REGISTRY/$APP_PATH/$APP_NAME:$APP_TAG"

if [ "$ENV_TYPE" = "local" ]; then
  if [ -f ../.env.local ]; then
    set -a
    source ../.env.local
    set +a
  else
    echo "Warning: ../.env.local file not found"
  fi
  BUILD_ARGS="--no-cache"
else
  # azure
  BUILD_ARGS=""
fi

echo "Building Docker image for $APP_NAME targeting $ENV_TYPE..."

docker build $BUILD_ARGS --platform linux/amd64 \
  --build-arg GOOGLE_API_KEY="$GOOGLE_API_KEY" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg API_BASE_URL="$API_BASE_URL" \
  --build-arg API_KEY="$API_KEY" \
  --build-arg API_EVENTS_PATH="$API_EVENTS_PATH" \
  --build-arg API_ANALYSES_PATH="$API_ANALYSES_PATH" \
  --build-arg API_PROPOSALS_PATH="$API_PROPOSALS_PATH" \
  --build-arg API_COMPLIANCE_RESULTS_PATH="$API_COMPLIANCE_RESULTS_PATH" \
  --build-arg API_JOBS_CALLBACK="$API_JOBS_CALLBACK" \
  -t "$IMAGE" -f Dockerfile ..

if [ "$ENV_TYPE" = "azure" ]; then
  echo "Pushing image to ACR..."
  docker push "$IMAGE"
  echo "Build and push complete for $APP_NAME!"
else
  echo "Build complete for $APP_NAME! (Push skipped for local build)"
fi
