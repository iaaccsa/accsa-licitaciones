#!/bin/bash
set -e

# Variables
RESOURCE_GROUP="accsa-licitaciones"
ACA_ENV="env-licitaciones"
ACR_USER_NAME="accsalicitaciones"
SUBSCRIPTION_ID="d3fbaef6-2413-47bf-be3d-2019470dc20e"
REGISTRY="accsalicitaciones.azurecr.io"
REGISTRY_NAME="accsalicitaciones"

APP_PATH="services"
APP_NAME="service-file-extractor"
APP_TAG="latest"

IMAGE="$REGISTRY/$APP_PATH/$APP_NAME:$APP_TAG"

# Get ACR password
ACR_PASSWORD=$(az acr credential show --name "$REGISTRY_NAME" --query passwords[0].value -o tsv)

echo "Creating Container App Job '$APP_NAME'..."
az containerapp job create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --subscription "$SUBSCRIPTION_ID" \
  --image "$IMAGE" \
  --registry-server "$REGISTRY" \
  --registry-username "$ACR_USER_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --trigger-type "Manual" \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi

echo "Job '$APP_NAME' created successfully!"
