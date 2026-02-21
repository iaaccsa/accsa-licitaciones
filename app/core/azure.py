from azure.identity import ClientSecretCredential
from azure.mgmt.appcontainers import ContainerAppsAPIClient
from app.core.config import get_settings

settings = get_settings()

credential = ClientSecretCredential(
    tenant_id=settings.AZURE_TENANT_ID,
    client_id=settings.AZURE_CLIENT_ID,
    client_secret=settings.AZURE_CLIENT_SECRET,
)

azure_container_apps_client = ContainerAppsAPIClient(
    credential, settings.AZURE_SUBSCRIPTION_ID
)

def verify_azure_connection():
    try:
        # Check connection by listing jobs in the resource group
        jobs = azure_container_apps_client.jobs.list_by_resource_group(settings.AZURE_RESOURCE_GROUP)
        # Trigger an API call by fetching the first page
        next(jobs.by_page(), None)
        return True
    except Exception as e:
        print(f"Azure connection failed: {str(e)}")
        return False
