from app.repositories.base_repository import BaseRepository
from app.core.supabase import supabase

class JobRepository(BaseRepository):
    def __init__(self):
        super().__init__("jobs")

    def update_job_status(self, analysis_id: str, service_name: str, status: str, file_id: str = None, original_file_id: str = None, proposal_id: str = None):
        query = (
            supabase.table(self.table_name)
            .update({"status": status})
            .eq("analysis_id", analysis_id)
            .eq("service_name", service_name)
        )
        if file_id:
            query = query.eq("file_id", file_id)
        if original_file_id:
            query = query.eq("original_file_id", original_file_id)
        if proposal_id:
            query = query.eq("proposal_id", proposal_id)
        response = query.execute()
        return response.data[0] if response.data else None

    def count_jobs_by_service(self, analysis_id: str, service_name: str) -> int:
        response = (
            supabase.table(self.table_name)
            .select("id", count="exact")
            .eq("analysis_id", analysis_id)
            .eq("service_name", service_name)
            .execute()
        )
        return response.count or 0

    def count_completed_jobs(self, analysis_id: str, service_name: str) -> int:
        response = (
            supabase.table(self.table_name)
            .select("id", count="exact")
            .eq("analysis_id", analysis_id)
            .eq("service_name", service_name)
            .eq("status", "succeeded")
            .execute()
        )
        return response.count or 0

    def get_running_jobs(self, analysis_id: str):
        """Get all jobs that are not in a terminal state (succeeded, failed, cancelled)."""
        response = (
            supabase.table(self.table_name)
            .select("*")
            .eq("analysis_id", analysis_id)
            .not_.in_("status", ["succeeded", "failed", "cancelled"])
            .execute()
        )
        return response.data

    def fail_all_running_jobs(self, analysis_id: str) -> list:
        """Marca todos los jobs no-terminales como 'failed' (usado por timeout monitor)."""
        response = (
            supabase.table(self.table_name)
            .update({"status": "failed"})
            .eq("analysis_id", analysis_id)
            .not_.in_("status", ["succeeded", "failed", "cancelled"])
            .execute()
        )
        return response.data

job_repository = JobRepository()
