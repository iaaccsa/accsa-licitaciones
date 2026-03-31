#!/bin/bash
set -e

# Usage: ./create-azure-container-app-job.sh <APP_NAME>
# Example: ./create-azure-container-app-job.sh service-file-extractor

VALID_SERVICES=(
  "service-file-extractor"
  "service-files-converter"
  "service-files-converter-mistral"
  "service-chunk-and-index"
  "service-setup-qdrant"
  "service-requirement-extractor"
  "service-verify-compliance"
  "service-metadata-extractor"
  "service-proposal-scorer"
  "service-qdrant-by-file"
  "service-file-metadata-extractor"
  "service-documents-clasification"
  "service-joiner"
)

if [ -z "$1" ]; then
  echo "ERROR: APP_NAME is required"
  echo "Usage: $0 <APP_NAME>"
  echo "Valid services: ${VALID_SERVICES[*]}"
  exit 1
fi

# Validate APP_NAME
VALID=false
for svc in "${VALID_SERVICES[@]}"; do
  if [ "$1" == "$svc" ]; then
    VALID=true
    break
  fi
done

if [ "$VALID" == false ]; then
  echo "ERROR: Invalid APP_NAME '$1'"
  echo "Valid services: ${VALID_SERVICES[*]}"
  exit 1
fi

# Variables
RESOURCE_GROUP="accsa-licitaciones"
ACA_ENV="env-licitaciones"
ACR_USER_NAME="accsalicitaciones"
SUBSCRIPTION_ID="d3fbaef6-2413-47bf-be3d-2019470dc20e"
REGISTRY="accsalicitaciones.azurecr.io"
REGISTRY_NAME="accsalicitaciones"

APP_PATH="services"
APP_NAME="$1"
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
