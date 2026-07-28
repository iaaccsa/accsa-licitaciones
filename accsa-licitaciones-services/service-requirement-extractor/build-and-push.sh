#!/bin/bash
set -e

ENV_TYPE=$1

if [[ "$ENV_TYPE" != "local" && "$ENV_TYPE" != "azure" ]]; then
  echo "Usage: $0 [local|azure]"
  exit 1
fi

APP_NAME="service-requirement-extractor"
APP_TAG="latest"
APP_PATH="services"
REGISTRY="accsalicitaciones.azurecr.io"
IMAGE="$REGISTRY/$APP_PATH/$APP_NAME:$APP_TAG"

if [ "$ENV_TYPE" = "local" ]; then
  BUILD_ARGS="--no-cache"
else
  # azure
  BUILD_ARGS=""
fi

echo "Building Docker image for $APP_NAME targeting $ENV_TYPE..."

docker build $BUILD_ARGS --platform linux/amd64 \
  -t "$IMAGE" -f Dockerfile ..

if [ "$ENV_TYPE" = "azure" ]; then
  echo "Pushing image to ACR..."
  docker push "$IMAGE"
  echo "Build and push complete for $APP_NAME!"
else
  echo "Build complete for $APP_NAME! (Push skipped for local build)"
fi
