#!/bin/bash
set -e

REGISTRY="accsalicitaciones.azurecr.io/licitaciones"
APP_NAME="service-file-extractor"
APP_TAG="latest"

docker build --platform linux/amd64 -t "$REGISTRY/$APP_NAME:$APP_TAG" .
docker push "$REGISTRY/$APP_NAME:$APP_TAG"
