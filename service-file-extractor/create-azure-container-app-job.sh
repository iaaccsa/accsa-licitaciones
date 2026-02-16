#!/bin/bash
set -e

# Variables
RESOURCE_GROUP="accsa-licitaciones"
ACA_ENV="env-licitaciones"
ACR_NAME="accsalicitaciones"
SUBSCRIPTION_ID="d3fbaef6-2413-47bf-be3d-2019470dc20e"

JOB_NAME="file-extractor"
IMAGE="accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest"

echo "Getting ACR Password..."
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

echo "Creating Container App Job '$JOB_NAME'..."
az containerapp job create \
  --name "$JOB_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --subscription "$SUBSCRIPTION_ID" \
  --image "$IMAGE" \
  --registry-server "$ACR_NAME.azurecr.io" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --trigger-type "Manual" \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi

echo "Job '$JOB_NAME' created successfully!"
