#!/bin/bash
set -e

# Variables
RESOURCE_GROUP="accsa-licitaciones"
LOCATION="eastus"
ACA_ENV="env-licitaciones"
ACR_NAME="accsalicitaciones"
JOB_NAME="file-extractor"
IMAGE="accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest"
SUBSCRIPTION_ID="d3fbaef6-2413-47bf-be3d-2019470dc20e"

echo "Creating Container Apps Environment '$ACA_ENV'..."
az containerapp env create \
  --name $ACA_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --subscription $SUBSCRIPTION_ID

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

JOB_NAME_CONVERTER="files-converter"
IMAGE_CONVERTER="accsalicitaciones.azurecr.io/licitaciones/service-files-converter:latest"

echo "Creating Container App Job '$JOB_NAME_CONVERTER'..."
az containerapp job create \
  --name "$JOB_NAME_CONVERTER" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --subscription "$SUBSCRIPTION_ID" \
  --image "$IMAGE_CONVERTER" \
  --registry-server "$ACR_NAME.azurecr.io" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --trigger-type "Manual" \
  --replica-timeout 3600 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 2 --memory 4Gi

JOB_NAME_QDRANT="setup-qdrant"
IMAGE_QDRANT="accsalicitaciones.azurecr.io/licitaciones/service-setup-qdrant:latest"

echo "Creating Container App Job '$JOB_NAME_QDRANT'..."
az containerapp job create \
  --name "$JOB_NAME_QDRANT" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --subscription "$SUBSCRIPTION_ID" \
  --image "$IMAGE_QDRANT" \
  --registry-server "$ACR_NAME.azurecr.io" \
  --registry-username "$ACR_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --trigger-type "Manual" \
  --replica-timeout 600 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 0.5 --memory 1Gi

echo "Infrastructure setup complete!"
