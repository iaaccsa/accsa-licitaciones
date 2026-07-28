import asyncio
import logging

from app.core.config import get_settings
from app.repositories.analysis_repository import analysis_repository
from app.repositories.workflow_step_repository import workflow_step_repository

logger = logging.getLogger(__name__)
settings = get_settings()


class JobMonitorService:
    """
    Monitor periódico que detecta workflow steps trabados en 'running' más allá
    del timeout configurado y marca los análisis correspondientes como fallidos.
    """

    def __init__(self):
        self._running = False
        self._processing: set = set()

    async def run_forever(self) -> None:
        self._running = True
        logger.info(
            f"[JobMonitor] Iniciado. "
            f"Timeout={settings.JOB_TIMEOUT_MINUTES}m, "
            f"Intervalo={settings.JOB_MONITOR_INTERVAL_SECONDS}s"
        )
        while self._running:
            try:
                await self._poll_once()
            except Exception as e:
                logger.error(f"[JobMonitor] Error en ciclo de poll: {e}", exc_info=True)
            await asyncio.sleep(settings.JOB_MONITOR_INTERVAL_SECONDS)

    async def _poll_once(self) -> None:
        steps = await asyncio.to_thread(
            workflow_step_repository.get_timed_out_steps,
            settings.JOB_TIMEOUT_MINUTES,
        )
        if not steps:
            logger.debug("[JobMonitor] Sin steps timed-out.")
            return

        analysis_map: dict = {}
        for s in steps:
            aid = str(s["analysis_id"])
            analysis_map.setdefault(aid, []).append(s["code"])

        logger.warning(
            f"[JobMonitor] {len(steps)} step(s) timed-out en "
            f"{len(analysis_map)} análisis: {list(analysis_map.keys())}"
        )

        for aid, codes in analysis_map.items():
            await self._handle_timed_out_analysis(aid, codes)

    async def _handle_timed_out_analysis(self, analysis_id: str, codes: list) -> None:
        if analysis_id in self._processing:
            logger.warning(f"[JobMonitor] Skipping analysis_id={analysis_id}: ya en proceso.")
            return

        self._processing.add(analysis_id)
        try:
            analysis = await asyncio.to_thread(analysis_repository.get_by_id, analysis_id)
            if not analysis:
                logger.warning(f"[JobMonitor] analysis_id={analysis_id} no encontrado, se omite.")
                return
            if analysis.get("status") != "processing":
                logger.info(
                    f"[JobMonitor] Skipping analysis_id={analysis_id}: "
                    f"status='{analysis.get('status')}', no está en 'processing'."
                )
                return

            # Import aquí para evitar circular import en tiempo de módulo
            from app.services.job_orchestrator_service import job_orchestrator_service
            await asyncio.to_thread(
                job_orchestrator_service.fail_timed_out_analysis, analysis_id, codes
            )
            logger.warning(
                f"[JobMonitor] analysis_id={analysis_id} marcado como fallido. Steps: {codes}"
            )
        except Exception as e:
            logger.error(
                f"[JobMonitor] Error procesando analysis_id={analysis_id}: {e}", exc_info=True
            )
        finally:
            self._processing.discard(analysis_id)

    def stop(self) -> None:
        self._running = False


job_monitor_service = JobMonitorService()
