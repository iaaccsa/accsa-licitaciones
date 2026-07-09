#!/bin/bash
set -e

# Usage: ./create-azure-container-app-job.sh <APP_NAME>
# Example: ./create-azure-container-app-job.sh service-file-extractor

VALID_SERVICES=(
  "service-file-extractor"
  "service-files-converter-mistral"
  "service-qdrant-by-file"
  "service-file-metadata-extractor"
  "service-digital-sig-extractor"
  "service-documents-classifier"
  "service-documents-grouper"
  "service-tender-classifier"
  "service-requirement-extractor"
  "service-build-proposal-index"
  "service-compliance-matcher"
  "service-admissibility-gate"
  "service-compliance-summarizer"
  "service-economic-offer-extractor"
  "service-admissibility-matcher"
  "lab-service-file-extractor"
  "lab-service-files-converter-mistral"
  "lab-service-qdrant-by-file"
  "lab-service-requirement-extractor"
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

# Lab jobs: ACR repo leaf stays lab-service-X, but the ACA Job name is
# shortened to lab-X (Azure caps Job names at 32 chars). Mirrors
# accsa-admissibility-lab/services/create-lab-aca-jobs.sh and the lab
# orchestrator's _job_name_for_service.
if [[ "$APP_NAME" == lab-service-* ]]; then
  JOB_NAME="lab-${APP_NAME#lab-service-}"
else
  JOB_NAME="$APP_NAME"
fi

# Get ACR password
ACR_PASSWORD=$(az acr credential show --name "$REGISTRY_NAME" --query passwords[0].value -o tsv)

echo "Creating Container App Job '$JOB_NAME' (image: $IMAGE)..."
az containerapp job create \
  --name "$JOB_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ACA_ENV" \
  --subscription "$SUBSCRIPTION_ID" \
  --image "$IMAGE" \
  --registry-server "$REGISTRY" \
  --registry-username "$ACR_USER_NAME" \
  --registry-password "$ACR_PASSWORD" \
  --trigger-type "Manual" \
  --replica-timeout 3600 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi

echo "Job '$JOB_NAME' created successfully!"
