from app.core.supabase import supabase
from typing import List, Dict, Any

class BaseRepository:
    def __init__(self, table_name: str):
        self.table_name = table_name

    def get_all(self) -> List[Dict[str, Any]]:
        response = supabase.table(self.table_name).select("*").execute()
        return response.data

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        response = supabase.table(self.table_name).insert(data).execute()
        return response.data[0]

    def create_batch(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        response = supabase.table(self.table_name).insert(data).execute()
        return response.data
