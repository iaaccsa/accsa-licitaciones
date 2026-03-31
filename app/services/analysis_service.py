from app.repositories.analysis_repository import analysis_repository
from app.repositories.proposal_repository import proposal_repository
from app.repositories.tender_repository import tender_repository
from app.schemas.analysis import Analysis, AnalysisFromStoragePath, AnalysisUpdate, AnalysisStatusUpdate, AnalysisSource
from app.schemas.event import EventBase
from app.services.event_service import event_service
from app.services.workflow_step_service import workflow_step_service
from app.services.job_orchestrator_service import job_orchestrator_service
from app.core.supabase import supabase
from fastapi import UploadFile
from typing import List
import logging
import uuid

logger = logging.getLogger(__name__)

class AnalysisService:
    def __init__(self):
        self.repository = analysis_repository

    def get_all_analyses(self) -> List[Analysis]:
        data = self.repository.get_all()
        # Pydantic validation handles the conversion
        return [Analysis(**item) for item in data]

    async def create_analysis(self, file: UploadFile, user_name: str | None = None) -> Analysis:
        # 1. Generate UUID for filename
        file_uuid = str(uuid.uuid4())
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'zip'
        file_path = f"{file_uuid}.{file_extension}"
        
        # 2. Upload file to Supabase Storage
        file_content = await file.read()
        supabase.storage.from_("artifacts").upload(
            path=file_path,
            file=file_content,
            file_options={"content-type": "application/zip"}
        )
        
        # 3. Create Analysis record
        analysis_data = {
            "status": "pending",
            "artifact_path": file_path,
        }
        if user_name:
            analysis_data["user_name"] = user_name
        analysis_record = self.repository.create(analysis_data)
        analysis = Analysis(**analysis_record)
        
        # 4. Log Event
        event_data = EventBase(
            analysis_id=analysis.id,
            level="info",
            message="Archivo ZIP recibido con todos los documentos.",
            source="api",
            details={"original_filename": file.filename}
        )
        event_service.create_event(event_data)
        
        # 5. Initialize Workflow Steps
        workflow_step_service.initialize_steps(analysis.id)
        
        # 6. Start Jobs Pipeline
        try:
            job_orchestrator_service.start_pipeline(analysis_id=analysis.id)
        except Exception as e:
            logger.error(f"Error starting jobs pipeline for analysis {analysis.id}: {e}")
        
        return analysis

    async def create_analysis_from_storage(self, data: AnalysisFromStoragePath) -> Analysis:
        # 1. Create Analysis record (file already in Supabase Storage)
        analysis_data = {
            "status": "pending",
            "artifact_path": data.storage_path,
        }
        if data.user_name:
            analysis_data["user_name"] = data.user_name
        analysis_record = self.repository.create(analysis_data)
        analysis = Analysis(**analysis_record)

        # 2. Log Event
        event_data = EventBase(
            analysis_id=analysis.id,
            level="info",
            message="Archivo ZIP recibido con todos los documentos.",
            source="api",
            details={"storage_path": data.storage_path}
        )
        event_service.create_event(event_data)

        # 3. Initialize Workflow Steps
        workflow_step_service.initialize_steps(analysis.id)

        # 4. Start Jobs Pipeline
        try:
            job_orchestrator_service.start_pipeline(analysis_id=analysis.id)
        except Exception as e:
            logger.error(f"Error starting jobs pipeline for analysis {analysis.id}: {e}")

        return analysis

    def get_analysis_by_id(self, analysis_id) -> Analysis:
        data = self.repository.get_by_id(analysis_id)
        if not data:
            return None
        return Analysis(**data)

    def update_analysis(self, analysis_id, update_data: AnalysisUpdate) -> Analysis:
        data = update_data.model_dump(exclude_none=True)
        result = self.repository.update_by_id(str(analysis_id), data)
        return Analysis(**result)

    def update_analysis_status(self, analysis_id, status_update: AnalysisStatusUpdate) -> Analysis:
        update_data = status_update.model_dump(exclude_none=True)
        data = self.repository.update_by_id(str(analysis_id), update_data)
        return Analysis(**data)

    def get_sources(self, analysis_id) -> List[AnalysisSource]:
        sources = []
        proposals = proposal_repository.get_by_analysis_id(analysis_id)
        for p in proposals:
            sources.append(AnalysisSource(type="proposal", id=p["id"], label=p["label"]))
        tenders = tender_repository.get_by_analysis_id(analysis_id)
        for t in tenders:
            sources.append(AnalysisSource(type="tender", id=t["id"], label=t["label"]))
        return sources

analysis_service = AnalysisService()
