---
name: service-creator
description: Guide for creating new services. This skill should be used when users want to create a new service with a standard structure, including Dockerfile, main.py, and deployment scripts.
---

# Service Creator

This skill provides a standardized way to create new services in the `accsa-licitaciones-services` repository.

## Usage

To create a new service, follow these steps:

1.  **Determine the Service Name**: Choose a descriptive name for the new service (e.g., `service-my-new-feature`).
2.  **Run the Creation Script**: Execute the following command in the root of the repository to create the service directory and populate it with the template files.

```bash
# Set the service name
SERVICE_NAME="<SERVICE_NAME>"

# Create the service directory
mkdir -p "$SERVICE_NAME"

# Copy template files
cp .agent/skills/service-creator/resources/* "$SERVICE_NAME/"

# Replace placeholders
sed -i '' "s/<SERVICE_NAME>/$SERVICE_NAME/g" "$SERVICE_NAME/"*
sed -i '' "s/<SERVICE_NAME_SLUG>/${SERVICE_NAME//service-/}/g" "$SERVICE_NAME/"*
```

3.  **Customize the Service**:
    *   **Dockerfile**: Update environment variables if needed.
    *   **main.py**: Implement the specific logic for the service.
    *   **requirements.txt**: Add necessary Python dependencies.
    *   **build-and-push.sh**: Verify the registry and image tag.
    *   **create-azure-container-app-job.sh**: Update resource group, environment, and subscription details if they differ from the defaults.

4.  **Build and Push**: Run `./build-and-push.sh` inside the service directory to build and push the Docker image.
5.  **Create Job**: Run `./create-azure-container-app-job.sh` to create the Azure Container App Job.

## Resources

The following templates are provided in the `resources` directory:

*   `Dockerfile`: Standard Dockerfile for Python services.
*   `main.py`: Boilerplate Python script with Supabase and logger setup.
*   `requirements.txt`: Basic dependencies.
*   `build-and-push.sh`: Script to build and push the Docker image to ACR.
*   `create-azure-container-app-job.sh`: Script to create the Container App Job in Azure.
