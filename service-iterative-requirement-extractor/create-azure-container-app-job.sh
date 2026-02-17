#!/bin/bash
set -e

# Variables
RESOURCE_GROUP="accsa-licitaciones"
ACA_ENV="env-licitaciones"
ACR_NAME="accsalicitaciones"
SUBSCRIPTION_ID="d3fbaef6-2413-47bf-be3d-2019470dc20e"

JOB_NAME="iterative-requirement-extractor"
IMAGE="accsalicitaciones.azurecr.io/licitaciones/service-$JOB_NAME:latest"

echo "Getting ACR Password..."
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Load environment variables
if [ -f ../env_vars ]; then
  set -a
  source ../env_vars
  set +a
else
  echo "Warning: ../env_vars file not found"
fi

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
  --secrets "openai-api-key=$OPENAI_API_KEY" "qdrant-url=$QDRANT_URL" "qdrant-api-key=$QDRANT_API_KEY" "supabase-url=$SUPABASE_URL" "supabase-key=$SUPABASE_SERVICE_ROLE_KEY" \
  --env-vars "ANALYSIS_ID=manual-trigger" "OPENAI_API_KEY=secretref:openai-api-key" "QDRANT_URL=secretref:qdrant-url" "QDRANT_API_KEY=secretref:qdrant-api-key" "SUPABASE_URL=secretref:supabase-url" "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-key" \
  --trigger-type "Manual" \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi

echo "Job '$JOB_NAME' created successfully!"
