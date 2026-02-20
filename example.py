from azure.identity import ClientSecretCredential
from azure.mgmt.appcontainers import ContainerAppsAPIClient

credential = ClientSecretCredential(
    tenant_id=os.environ["AZURE_TENANT_ID"],
    client_id=os.environ["AZURE_CLIENT_ID"],
    client_secret=os.environ["AZURE_CLIENT_SECRET"],
)

client = ContainerAppsAPIClient(credential, os.environ["AZURE_SUBSCRIPTION_ID"])

# Lanzar un job
result = client.jobs.begin_start(
    resource_group_name="accsa-licitaciones",
    job_name="file-extractor",
    template={
        "containers": [{
            "name": "file-extractor",
            "image": "accsalicitaciones.azurecr.io/licitaciones/service-file-extractor:latest",
            "env": [
                {"name": "ANALYSIS_ID", "value": analysis_id},
            ]
        }]
    }
)
