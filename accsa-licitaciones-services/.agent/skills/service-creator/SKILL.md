---
name: service-creator
description: Guide for creating new services. This skill should be used when users want to create a new service with a standard structure, including Dockerfile, main.py, and build script.
---

# Service Creator

This skill provides a standardized way to create new services in the `accsa-licitaciones-services` repository following the canonical pattern (reference: `service-file-extractor`).

## Usage

To create a new service, follow these steps:

1. **Determine the Service Name**: Choose a descriptive name (e.g., `service-my-new-feature`).

2. **Create the service directory and copy templates**:

```bash
SERVICE_NAME="<SERVICE_NAME>"

mkdir -p "$SERVICE_NAME"

cp .claude/skills/service-creator/resources/main.py "$SERVICE_NAME/main.py"
cp .claude/skills/service-creator/resources/Dockerfile "$SERVICE_NAME/Dockerfile"
cp .claude/skills/service-creator/resources/build-and-push.sh "$SERVICE_NAME/build-and-push.sh"
cp .claude/skills/service-creator/resources/requirements.txt "$SERVICE_NAME/requirements.txt"
chmod +x "$SERVICE_NAME/build-and-push.sh"

# Replace placeholders (macOS compatible)
SERVICE_SLUG="${SERVICE_NAME//service-/}"
python3 -c "
import sys
old, new = sys.argv[1], sys.argv[2]
for f in ['$SERVICE_NAME/main.py', '$SERVICE_NAME/Dockerfile', '$SERVICE_NAME/build-and-push.sh']:
    with open(f) as fh: c = fh.read()
    c = c.replace('<SERVICE_NAME>', old).replace('<SERVICE_NAME_SLUG>', new)
    with open(f, 'w') as fh: fh.write(c)
" "$SERVICE_NAME" "$SERVICE_SLUG"
```

3. **Customize the service**:
   - **`main.py`**: Implement the logic inside `process_<slug>()`. Add extra env vars (e.g., `QDRANT_URL`, `SUPABASE_URL`) if needed — replicate the ARG/ENV/RUN validate pattern in the Dockerfile and add `--build-arg` entries in `build-and-push.sh`.
   - **`requirements.txt`**: Add necessary Python dependencies.
   - **`Dockerfile`**: Add extra ARG/ENV/RUN blocks for any additional vars.
   - **`build-and-push.sh`**: Add `--build-arg` lines for any additional vars.

4. **Register the service**:
   - Add entry in `azure-pipelines.yml` matrix:
     ```yaml
     <SERVICE_NAME>:
       SERVICE_NAME: "<SERVICE_NAME>"
     ```
   - Add to `VALID_SERVICES` list in `create-azure-container-app-job.sh`.

5. **Build and test locally**:
```bash
cd <SERVICE_NAME>
./build-and-push.sh local
```

6. **Create the Azure Container App Job** (once):
```bash
./create-azure-container-app-job.sh <SERVICE_NAME>
```

## Canonical patterns

- `log_event(ANALYSIS_ID, level, message, EVENT_SOURCE)` — sin supabase como primer arg.
- `notify_failure(error_msg)` — llama `log_event` + PATCH status failed + POST callback.
- `main()` captura `HTTPError` y `Exception` → `notify_failure()` + `sys.exit(0)` (nunca `sys.exit(1)`).
- Success callback al final de `process_<slug>()`.
- Supabase solo si el servicio necesita `storage.download()` — añadir `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` en ese caso.
- No usar `load_dotenv`, ni fallback logger try/except.

## Resources

- `main.py` — boilerplate canónico con `api_request()`, `notify_failure()`, `process_<slug>()`, `main()`.
- `Dockerfile` — patrón canónico: ARG → ENV → RUN validate → pip install → COPY supabase_logger.py → COPY main.py.
- `build-and-push.sh` — script unificado local/azure. Registry: `accsalicitaciones.azurecr.io/services/<SERVICE_NAME>:latest`.
- `requirements.txt` — base mínima (`requests`).
