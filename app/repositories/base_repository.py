from app.core.supabase import supabase
from typing import List, Dict, Any

class BaseRepository:
    def __init__(self, table_name: str):
        self.table_name = table_name

    def get_all(self) -> List[Dict[str, Any]]:
        response = supabase.table(self.table_name).select("*").execute()
        return response.data
