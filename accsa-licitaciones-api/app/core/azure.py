from functools import lru_cache

from azure.identity import ClientSecretCredential
from azure.mgmt.appcontainers import ContainerAppsAPIClient
from app.core.config import get_settings

settings = get_settings()

def is_azure_configured() -> bool:
    return all([
        settings.AZURE_TENANT_ID,
        settings.AZURE_CLIENT_ID,
        settings.AZURE_CLIENT_SECRET,
        settings.AZURE_SUBSCRIPTION_ID,
        settings.AZURE_RESOURCE_GROUP,
    ])

@lru_cache()
def get_azure_client() -> ContainerAppsAPIClient:
    """Built on first use rather than at import, so the API starts with no
    AZURE_* variables at all when JOB_EXECUTOR=local."""
    credential = ClientSecretCredential(
        tenant_id=settings.AZURE_TENANT_ID,
        client_id=settings.AZURE_CLIENT_ID,
        client_secret=settings.AZURE_CLIENT_SECRET,
    )
    return ContainerAppsAPIClient(
        credential,
        settings.AZURE_SUBSCRIPTION_ID,
        # ARM throttles management requests (HTTP 429). Fan-out steps launch jobs in
        # bursts, so give the azure-core retry policy more headroom; it honors the
        # Retry-After header on 429 automatically.
        retry_total=10,
        retry_status=10,
        retry_backoff_max=120,
    )

def verify_azure_connection():
    if not is_azure_configured():
        return False
    try:
        # Check connection by listing jobs in the resource group
        jobs = get_azure_client().jobs.list_by_resource_group(settings.AZURE_RESOURCE_GROUP)
        # Trigger an API call by fetching the first page
        next(jobs.by_page(), None)
        return True
    except Exception as e:
        print(f"Azure connection failed: {str(e)}")
        return False
