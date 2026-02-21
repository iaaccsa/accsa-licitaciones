from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase

class JobRepository(BaseRepository):
    def __init__(self):
        super().__init__("jobs")

    def update_job_status(self, analysis_id: str, service_name: str, status: str):
        response = supabase.table(self.table_name).update({"status": status}).eq("analysis_id", analysis_id).eq("service_name", service_name).execute()
        return response.data[0] if response.data else None

job_repository = JobRepository()
