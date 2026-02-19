from app.repositories.workflow_step_repository import workflow_step_repository
from app.schemas.workflow_step import WorkflowStep, WorkflowStepFilter
from typing import List

class WorkflowStepService:
    def __init__(self):
        self.repository = workflow_step_repository

    def search_steps(self, filter_params: WorkflowStepFilter) -> List[WorkflowStep]:
        data = self.repository.get_by_analysis_id(
            analysis_id=filter_params.analysis_id
        )
        return [WorkflowStep(**item) for item in data]

workflow_step_service = WorkflowStepService()
