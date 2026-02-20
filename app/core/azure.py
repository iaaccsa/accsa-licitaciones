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
