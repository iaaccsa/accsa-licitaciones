# Estrategia de Ejecución — Container Apps Jobs

## Resumen

Ejecutar contenedores on-demand desde **n8n** usando **Azure Container Apps Jobs**.
Todas las variables de entorno se pasan por parámetro al disparar el job desde n8n.

---

## Arquitectura

```
┌──────────┐     webhook      ┌──────────┐    REST API       ┌─────────────────────┐
│ Supabase │  ──────────────► │   n8n    │ ────────────────► │ Azure Container     │
│ (nuevo   │                  │          │  POST /start      │ Apps Job            │
│ análisis)│                  │          │  + env vars       │ (ACR image)         │
└──────────┘                  └──────────┘                   └─────────────────────┘
```

---

## Datos del proyecto

| Recurso              | Valor                                          |
| -------------------- | ---------------------------------------------- |
| Subscription         | `d3fbaef6-2413-47bf-be3d-2019470dc20e`         |
| Resource Group       | `accsa-licitaciones`                           |
| Environment          | `env-licitaciones`                             |
| ACR Server           | `accsalicitaciones.azurecr.io`                 |

---

## Configuración inicial (una sola vez)

### 1. Crear el Container Apps Environment

```bash
az containerapp env create \
  --name env-licitaciones \
  --resource-group accsa-licitaciones \
  --location eastus \
  --subscription d3fbaef6-2413-47bf-be3d-2019470dc20e
```

### 2. Crear un Service Principal para n8n

```bash
az ad sp create-for-rbac \
  --name "n8n-aca-runner" \
  --role Contributor \
  --scopes /subscriptions/d3fbaef6-2413-47bf-be3d-2019470dc20e/resourceGroups/accsa-licitaciones
```

Guardar los valores devueltos para configurar en n8n:

| Campo      | Uso en n8n       |
| ---------- | ---------------- |
| `appId`    | Client ID        |
| `password` | Client Secret    |
| `tenant`   | Tenant ID        |

---

## Build & Push de imágenes

Las imágenes se compilan para **linux/amd64** (requerido por Azure Container Apps).
Cada servicio tiene un script `build-and-push.sh` en su carpeta:

```bash
cd service-file-extractor
./build-and-push.sh
```

> **Nota:** Si se compila desde Apple Silicon (M1/M2/M3), el flag `--platform linux/amd64` es obligatorio.
> Ya está incluido en el script.

---

## Crear Jobs (uno por servicio)

### Job: file-extractor

```bash
az containerapp job create \
  --name "file-extractor" \
  --resource-group "accsa-licitaciones" \
  --environment "env-licitaciones" \
  --subscription "d3fbaef6-2413-47bf-be3d-2019470dc20e" \
  --image "accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest" \
  --registry-server "accsalicitaciones.azurecr.io" \
  --registry-username "accsalicitaciones" \
  --registry-password "<ACR_PASSWORD>" \
  --trigger-type "Manual" \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi
```

> No se configuran secrets ni env-vars en el job. Todo se pasa al ejecutar.

### Job: files-converter

```bash
az containerapp job create \
  --name "files-converter" \
  --resource-group "accsa-licitaciones" \
  --environment "env-licitaciones" \
  --subscription "d3fbaef6-2413-47bf-be3d-2019470dc20e" \
  --image "accsalicitaciones.azurecr.io/licitaciones/service-files-converter:latest" \
  --registry-server "accsalicitaciones.azurecr.io" \
  --registry-username "accsalicitaciones" \
  --registry-password "<ACR_PASSWORD>" \
  --trigger-type "Manual" \
  --replica-timeout 3600 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 2 --memory 4Gi
```

### Job: setup-qdrant

```bash
az containerapp job create \
  --name "setup-qdrant" \
  --resource-group "accsa-licitaciones" \
  --environment "env-licitaciones" \
  --subscription "d3fbaef6-2413-47bf-be3d-2019470dc20e" \
  --image "accsalicitaciones.azurecr.io/licitaciones/service-setup-qdrant:latest" \
  --registry-server "accsalicitaciones.azurecr.io" \
  --registry-username "accsalicitaciones" \
  --registry-password "<ACR_PASSWORD>" \
  --trigger-type "Manual" \
  --replica-timeout 600 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 0.5 --memory 1Gi
```

> Menos recursos requeridos (0.5 CPU, 1Gi) ya que solo configura la colección.

### Job: chunk-and-index

```bash
az containerapp job create \
  --name "chunk-and-index" \
  --resource-group "accsa-licitaciones" \
  --environment "env-licitaciones" \
  --subscription "d3fbaef6-2413-47bf-be3d-2019470dc20e" \
  --image "accsalicitaciones.azurecr.io/licitaciones/service-chunk-and-index:latest" \
  --registry-server "accsalicitaciones.azurecr.io" \
  --registry-username "accsalicitaciones" \
  --registry-password "<ACR_PASSWORD>" \
  --trigger-type "Manual" \
  --replica-timeout 1800 \
  --replica-retry-limit 0 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --cpu 1 --memory 2Gi
```

> Recursos estándar (1 CPU, 2Gi) para procesamiento intensivo de embeddings.



---

## Disparar desde n8n

### Opción A: Service Principal (Fallo conocido)
*(Si `az ad sp create-for-rbac` falla por permisos de directorio)*

### Opción B: Refresh Token (Recomendada)
Esta opción funciona usando tu usuario y el **Client ID público de Azure CLI**, sin necesidad de crear una App Registration.

**Paso 1: Generar Refresh Token**

Ejecutá:
```bash
pip install requests
python3 scripts/get-refresh-token.py
```
Guardá el token que te devuelve (dura 90 días).

**Paso 2: Configurar n8n**

Agregá un nodo **HTTP Request** antes de disparar el job.

**Nodo: "Refresh Azure Token"**
*   **Method:** `POST`
*   **URL:** `https://login.microsoftonline.com/44885944-1db4-41bb-9ae3-ba1b6ce2e91c/oauth2/v2.0/token`
*   **Body Type:** `Form-Urlencoded`
*   **Parameters:**
    *   `client_id`: `04b07795-8ddb-461a-bbee-02f9e1bf7b46`
    *   `grant_type`: `refresh_token`
    *   `refresh_token`: `<PEGAR_REFRESH_TOKEN_AQUI>`

Este nodo devolverá un JSON con `access_token`.

**Nodo: "Trigger File Extractor"**
*   **URL:** `https://management.azure.com/subscriptions/d3fbaef6-2413-47bf-be3d-2019470dc20e/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/file-extractor/start?api-version=2024-03-01`
*   **Headers:**
    *   `Authorization`: `Bearer {{ $node["Refresh Azure Token"].json["access_token"] }}`
    *   `Content-Type`: `application/json`



```json
{
  "containers": [
    {
      "name": "file-extractor",
      "image": "accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest",
      "env": [
        { "name": "ANALYSIS_ID", "value": "{{ANALYSIS_ID}}" }
      ]
    }
  ]
}
```

> **⚠️ Importante:** `containers` va **directamente** en el body, NO envuelto en `"template"`. El schema `StartJobExecutionTemplate` no acepta la propiedad `template`.

Para el servicio de files-converter, cambiás el nombre del job y agregás `LLAMA_CLOUD_API_KEY`:

**Nodo: "Trigger Files Converter"**
*   **URL:** `https://management.azure.com/subscriptions/d3fbaef6-2413-47bf-be3d-2019470dc20e/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/files-converter/start?api-version=2024-03-01`

```json
{
  "containers": [
    {
      "name": "files-converter",
      "image": "accsalicitaciones.azurecr.io/licitaciones/service-files-converter:latest",
      "env": [
        { "name": "ANALYSIS_ID", "value": "{{ANALYSIS_ID}}" }
      ]
    }
  ]
}
```

**Nodo: "Trigger Setup Qdrant"**
*   **URL:** `https://management.azure.com/subscriptions/d3fbaef6-2413-47bf-be3d-2019470dc20e/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/setup-qdrant/start?api-version=2024-03-01`

```json
        { "name": "QDRANT_API_KEY", "value": "{{QDRANT_API_KEY}}" }
      ]
    }
  ]
}
```

**Nodo: "Trigger Chunk & Index"**
*   **URL:** `https://management.azure.com/subscriptions/d3fbaef6-2413-47bf-be3d-2019470dc20e/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/chunk-and-index/start?api-version=2024-03-01`

```json
{
  "containers": [
    {
      "name": "chunk-and-index",
      "image": "accsalicitaciones.azurecr.io/licitaciones/service-chunk-and-index:latest",
      "env": [
        { "name": "FILE_ID", "value": "{{FILE_ID}}" },
        { "name": "SUPABASE_URL", "value": "{{SUPABASE_URL}}" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "value": "{{SUPABASE_SERVICE_ROLE_KEY}}" },
        { "name": "OPENAI_API_KEY", "value": "{{OPENAI_API_KEY}}" },
        { "name": "QDRANT_URL", "value": "{{QDRANT_URL}}" },
        { "name": "QDRANT_API_KEY", "value": "{{QDRANT_API_KEY}}" }
      ]
    }
  ]
}
```

### Flujo en n8n

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Webhook     │────►│ Obtener token    │────►│ POST /start      │
│  Supabase    │     │ Azure OAuth      │     │ + todas las      │
│  INSERT      │     │                  │     │   env vars       │
└──────────────┘     └──────────────────┘     └──────────────────┘
```

---

## Variables a configurar en n8n

| Variable                    | Descripción                           |
| --------------------------- | ------------------------------------- |
| `TENANT_ID`                 | Azure AD tenant ID                    |
| `CLIENT_ID`                 | Service Principal app ID              |
| `CLIENT_SECRET`             | Service Principal password            |
| `SUPABASE_URL`              | URL del proyecto Supabase             |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de Supabase         |
| `QDRANT_API_KEY`            | (futuro) API key de Qdrant            |

---

## Probar manualmente con curl

```bash
curl -X POST \
  "https://management.azure.com/subscriptions/0690acee-5fc7-48ad-8b8a-6a9cdffc3540/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/file-extractor/start?api-version=2024-03-01" \
  -H "Authorization: Bearer $(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)" \
  -H "Content-Type: application/json" \
  -d '{
    "containers": [
      {
        "name": "file-extractor",
        "image": "accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest",
        "env": [
          { "name": "ANALYSIS_ID", "value": "<ID>" }
        ]
      }
    ]
  }'
```

---

## Comandos útiles

```bash
# Ver ejecuciones
az containerapp job execution list \
  --name file-extractor \
  --resource-group accsa-licitaciones -o table

# Ver estado de una ejecución específica
az containerapp job execution show \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --job-execution-name "<EXECUTION_NAME>" \
  --query "{status: properties.status, startTime: properties.startTime, endTime: properties.endTime}" -o json

# Ver logs de una ejecución
az containerapp job logs show \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --execution "<EXECUTION_NAME>"

# Actualizar imagen después de un nuevo build
az containerapp job update \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --image accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest

# Disparar manualmente desde CLI con YAML override
az containerapp job start \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --yaml job-template.yaml
```

---

## Troubleshooting

| Problema | Solución |
| -------- | -------- |
| `Operation not permitted: ~/.azure/commands/` | `sudo chmod -R u+rw ~/.azure/commands/` |
| `Unknown properties template in StartJobExecutionTemplate` | El body del POST `/start` lleva `containers` directamente, NO envuelto en `"template"` |
| Imagen falla en ACA pero funciona local | Verificar que se compiló con `--platform linux/amd64` |
