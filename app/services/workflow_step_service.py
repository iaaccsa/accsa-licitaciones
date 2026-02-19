from app.repositories.workflow_step_repository import workflow_step_repository
from app.schemas.workflow_step import WorkflowStep, WorkflowStepFilter
from datetime import datetime
from typing import List

class WorkflowStepService:
    def __init__(self):
        self.repository = workflow_step_repository

    def search_steps(self, filter_params: WorkflowStepFilter) -> List[WorkflowStep]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [WorkflowStep(**item) for item in data]

    def initialize_steps(self, analysis_id: str) -> List[WorkflowStep]:
        now = datetime.now()
        steps = [
            {
                "analysis_id": str(analysis_id),
                "code": "queued",
                "display_name": "Encolado",
                "status": "completed",
                "parent_code": None,
                "started_at": now.isoformat(),
                "ended_at": None
            },
            {
                "analysis_id": str(analysis_id),
                "code": "extractor",
                "display_name": "Extractor",
                "status": "pending",
                "parent_code": "queued",
                "started_at": None,
                "ended_at": None
            },
            {
                "analysis_id": str(analysis_id),
                "code": "converter",
                "display_name": "Convertidor",
                "status": "pending",
                "parent_code": "extractor",
                "started_at": None,
                "ended_at": None
            },
            {
                "analysis_id": str(analysis_id),
                "code": "rag_setup",
                "display_name": "Configuración RAG",
                "status": "pending",
                "parent_code": "converter",
                "started_at": None,
                "ended_at": None
            },
            {
                "analysis_id": str(analysis_id),
                "code": "chunk_and_index",
                "display_name": "Fragmentación e Indexación",
                "status": "pending",
                "parent_code": "rag_setup",
                "started_at": None,
                "ended_at": None
            },
            {
                "analysis_id": str(analysis_id),
                "code": "requirement_extraction",
                "display_name": "Extracción de Requisitos",
                "status": "pending",
                "parent_code": "chunk_and_index",
                "started_at": None,
                "ended_at": None
            }
        ]
        
        data = self.repository.create_batch(steps)
        return [WorkflowStep(**item) for item in data]

workflow_step_service = WorkflowStepService()
