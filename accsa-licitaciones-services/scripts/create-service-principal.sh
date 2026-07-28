#!/bin/bash

# Este script debe ser ejecutado por un Administrador de Azure que tenga permisos 
# para registrar aplicaciones (Application Administrator o Global Administrator)
# y permisos de Owner/User Access Administrator en la suscripción.

SUBSCRIPTION_ID="0690acee-5fc7-48ad-8b8a-6a9cdffc3540"
RESOURCE_GROUP="accsa-licitaciones"
SP_NAME="n8n-aca-runner"

echo "Creando Service Principal '$SP_NAME' con rol Contributor en el grupo de recursos '$RESOURCE_GROUP'..."

# Crear el Service Principal y mostrar el JSON de salida
az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --output json

echo ""
echo "--------------------------------------------------------"
echo "Por favor, comparta el JSON anterior con el solicitante."
echo "Es necesario para configurar la autenticación en n8n."
echo "--------------------------------------------------------"
