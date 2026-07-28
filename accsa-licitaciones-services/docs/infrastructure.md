# Services — Infrastructure & Operations

## Azure Infrastructure

| Resource | Value |
|----------|-------|
| Subscription ID | `d3fbaef6-2413-47bf-be3d-2019470dc20e` |
| Resource Group | `accsa-licitaciones` |
| ACA Environment | `env-licitaciones` |
| ACR | `accsalicitaciones.azurecr.io` |
| Region | `eastus` |
| Base image | `accsalicitaciones.azurecr.io/services/<service-name>:latest` |

## Environment Variables

### Baked into Docker image (build args)

| Variable | Service(s) | Description |
|----------|------------|-------------|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | All | Supabase service role key |
| `SUPABASE_ARTIFACTS_BASE_URL` | file-extractor | Base URL for downloading artifacts |
| `SUPABASE_FILES_BASE_URL` | files-converter | Base URL for downloading files |
| `API_BASE_URL` | All | Backend REST base URL |
| `API_KEY` | All | Authentication key (`X-API-Key`) |
| `API_EVENTS_PATH` | All | Events path (default: `/api/v1/events/`) |
| `API_PROPOSALS_PATH` | All | Proposals path |
| `API_ANALYSES_PATH` | All | Analyses path |
| `API_FILES_PATH` | All | Files path |
| `API_JOBS_CALLBACK` | All | Callback path on completion |
| `OPENAI_API_KEY` | chunk-and-index, iterative-req-ext, verify-compliance | OpenAI API key |
| `LLAMA_CLOUD_API_KEY` | files-converter | LlamaCloud/LlamaParse API key |
| `QDRANT_URL` | chunk-and-index, setup-qdrant, iterative-req-ext, verify-compliance | Qdrant URL |
| `QDRANT_API_KEY` | chunk-and-index, setup-qdrant, iterative-req-ext, verify-compliance | Qdrant API key |
| `COHERE_API_KEY` | verify-compliance | Cohere API key |
| `GOOGLE_API_KEY` | (configured, pending use) | Google API key |

### Passed at runtime (when orchestrator triggers the job)

| Variable | Service(s) | Description |
|----------|------------|-------------|
| `ANALYSIS_ID` | All | UUID of the ongoing analysis |
| `FILE_ID` | chunk-and-index | UUID of the file to process |
| `PROPOSAL_ID` | verify-compliance | UUID of the proposal to verify |

Jobs have no secrets configured in Azure. Static variables baked into image; dynamic ones injected at trigger time.

## CI/CD — Azure Pipelines

File: `azure-pipelines.yml`

- **Trigger:** push to `main`
- **Strategy:** matrix (parallel service builds)
- **Currently enabled:** `service-file-extractor`, `service-files-converter-llama`
- **To enable another service:** uncomment its entry in `strategy.matrix`

**Variable groups required in Azure DevOps:**
- `othes-vars`: ACR credentials (`AZURE_REGISTRY_SERVER`, `AZURE_REGISTRY_USER`, `AZURE_REGISTRY_PASS`)
- `api-vars`: backend API keys and paths
- `supabase-vars`: Supabase credentials

## Azure CLI Commands

```bash
# List executions of a job
az containerapp job execution list \
  --name file-extractor \
  --resource-group accsa-licitaciones -o table

# View logs of an execution
az containerapp job logs show \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --execution "<EXECUTION_NAME>"

# Update image after new build
az containerapp job update \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --image accsalicitaciones.azurecr.io/services/service-file-extractor:latest

# Trigger manually from CLI
az containerapp job start \
  --name file-extractor \
  --resource-group accsa-licitaciones \
  --yaml job-template.yaml

# Create a Container App Job (once per service)
./create-azure-container-app-job.sh service-file-extractor
```

## Orchestrator → Azure Job Trigger

Azure endpoint:
```
POST https://management.azure.com/subscriptions/{SUBSCRIPTION_ID}/resourceGroups/accsa-licitaciones/providers/Microsoft.App/jobs/{JOB_NAME}/start?api-version=2024-03-01
```

Body — `containers` goes directly in body, NOT inside `"template"`:
```json
{
  "containers": [
    {
      "name": "file-extractor",
      "image": "accsalicitaciones.azurecr.io/services/service-file-extractor:latest",
      "env": [
        { "name": "ANALYSIS_ID", "value": "{{ANALYSIS_ID}}" }
      ]
    }
  ]
}
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Image fails in ACA but works locally | Verify compiled with `--platform linux/amd64` |
| `Unknown properties template in StartJobExecutionTemplate` | POST `/start` body takes `containers` directly, NOT inside `"template"` |
| `Operation not permitted: ~/.azure/commands/` | `sudo chmod -R u+rw ~/.azure/commands/` |
| Build arg validation fails in Docker | Verify all required vars defined in `.env.local` or environment |
| Variable `SUPABASE_SERVICE_ROLE_KEY` not found | Renamed to `SUPABASE_SERVICE_KEY` across all services and pipelines |

## Key Files

| File | Purpose |
|------|---------|
| `azure-pipelines.yml` | CI/CD pipeline — enable/disable services here |
| `create-azure-container-app-job.sh` | Creates ACA Job in Azure (once per service) |
| `global/supabase_logger.py` | Shared logger copied into each image |
| `DEPLOYMENT.md` | Full infrastructure and deployment guide |
| `api-doc.md` | Backend API endpoint reference |
| `.env.local` | Local variables (gitignored) — required for local builds |
| `job-template.yaml` | YAML template for triggering jobs from CLI |
| `scripts/create-infrastructure.sh` | Initial Azure environment setup (one-time) |
