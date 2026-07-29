from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Asistente de Licitaciones Executor"
    VERSION: str = "2.2.0"
    APP_ENV: str = "development"

    # Deliberately distinct from the API's BACKEND_API_KEY: holding this one only
    # grants the ability to run an allowlisted service image on VM2.
    EXECUTOR_API_KEY: str

    # The caller never sends an image name. It is derived as
    # {EXECUTOR_REGISTRY}/{service_name}:latest once service_name passes the
    # allowlist, which is what bounds the damage of mounting the Docker socket.
    EXECUTOR_REGISTRY: str = "vm2:5000"
    EXECUTOR_ALLOWED_SERVICES: str

    # VM2 has 4 vCPU / 6 GB shared with the registry and the CI runner.
    EXECUTOR_MAX_CONCURRENCY: int = 3
    EXECUTOR_MAX_QUEUE: int = 200
    EXECUTOR_CPUS: float = 1.0
    EXECUTOR_MEMORY: str = "1536m"
    # Matches the --replica-timeout the Azure Container Apps Jobs used.
    EXECUTOR_JOB_TIMEOUT_SECONDS: int = 3600

    EXECUTOR_LOG_DIR: str = "/var/log/licitaciones-jobs"
    EXECUTOR_LOG_RETENTION_DAYS: int = 14
    # How long a finished execution stays queryable through GET /jobs/{id}.
    # Without this the in-memory registry would grow for the life of the process.
    EXECUTOR_HISTORY_TTL_MINUTES: int = 120

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def allowed_services(self) -> frozenset[str]:
        return frozenset(
            name.strip()
            for name in self.EXECUTOR_ALLOWED_SERVICES.split(",")
            if name.strip()
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
