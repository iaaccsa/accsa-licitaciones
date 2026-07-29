import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import UUID, uuid4

import docker
from docker.errors import ImageNotFound

from app.callback import notify_failure
from app.config import get_settings
from app.models import TERMINAL_STATES, ExecutionState, StartJobRequest

logger = logging.getLogger(__name__)
settings = get_settings()

MAINTENANCE_INTERVAL_SECONDS = 3600
LOG_TAIL_LINES = 20
STOP_SETTLE_SECONDS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Execution:
    execution_id: UUID
    execution_name: str
    request: StartJobRequest
    state: ExecutionState = ExecutionState.QUEUED
    exit_code: Optional[int] = None
    queued_at: datetime = field(default_factory=_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    container_id: Optional[str] = None
    log_path: Optional[Path] = None
    log_tail: str = ""
    stop_requested: bool = False
    task: Optional[asyncio.Task] = None


class JobRunner:
    """Runs service jobs as sibling containers on the host Docker daemon.

    Concurrency is an asyncio.Semaphore rather than a separate scheduler loop:
    its waiters are woken in FIFO order, which is the queue the spec asks for,
    and a job waiting to acquire it is exactly a job in 'queued' state.
    """

    def __init__(self):
        self._client: Optional[docker.DockerClient] = None
        self._semaphore = asyncio.Semaphore(settings.EXECUTOR_MAX_CONCURRENCY)
        self._executions: Dict[UUID, Execution] = {}
        self._log_dir = Path(settings.EXECUTOR_LOG_DIR)

    # -- Docker -------------------------------------------------------------

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    async def docker_status(self) -> str:
        try:
            await asyncio.to_thread(self.client.ping)
            return "ok"
        except Exception as e:
            logger.warning(f"Docker daemon unreachable: {e}")
            self._client = None
            return "unreachable"

    # -- Public API ---------------------------------------------------------

    def get(self, execution_id: UUID) -> Optional[Execution]:
        return self._executions.get(execution_id)

    def count(self, state: ExecutionState) -> int:
        return sum(1 for e in self._executions.values() if e.state == state)

    def submit(self, request: StartJobRequest) -> Execution:
        execution_id = uuid4()
        execution = Execution(
            execution_id=execution_id,
            execution_name=f"{request.service_name}-{execution_id.hex[:8]}",
            request=request,
        )
        self._executions[execution_id] = execution
        execution.task = asyncio.create_task(
            self._run(execution), name=execution.execution_name
        )
        logger.info(
            f"{execution.execution_name}: queued for analysis_id={request.analysis_id}"
        )
        return execution

    async def stop(self, execution: Execution) -> None:
        if execution.state in TERMINAL_STATES:
            return

        execution.stop_requested = True

        if execution.state == ExecutionState.QUEUED:
            if execution.task:
                execution.task.cancel()
            self._finish(execution, ExecutionState.STOPPED, None)
            return

        if execution.container_id:
            await asyncio.to_thread(self._kill, execution.container_id)
            # Give _launch_and_wait a moment to collect the logs and settle on
            # STOPPED, so the DELETE response does not still say 'running'.
            if execution.task:
                await asyncio.wait([execution.task], timeout=STOP_SETTLE_SECONDS)

    # -- Execution ----------------------------------------------------------

    async def _run(self, execution: Execution) -> None:
        failure: Optional[str] = None
        try:
            async with self._semaphore:
                if execution.stop_requested:
                    return
                failure = await self._launch_and_wait(execution)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(
                f"{execution.execution_name}: executor error: {e}", exc_info=True
            )
            self._finish(execution, ExecutionState.FAILED, None)
            failure = f"Executor error: {e}"

        # Deliberately outside the semaphore: an unreachable API would otherwise
        # hold a slot for the whole callback timeout on every failed job.
        if failure:
            await notify_failure(execution.request, failure)

    async def _launch_and_wait(self, execution: Execution) -> Optional[str]:
        """Returns the error message to report back, or None if nothing to report."""
        image = f"{settings.EXECUTOR_REGISTRY}/{execution.request.service_name}:latest"
        await asyncio.to_thread(self._ensure_image, image)

        container = await asyncio.to_thread(self._create, execution, image)
        execution.container_id = container.id
        execution.state = ExecutionState.RUNNING
        execution.started_at = _now()
        logger.info(f"{execution.execution_name}: running {image} ({container.short_id})")

        # shield keeps the wait alive when wait_for times out, so the same task
        # can be awaited again once the kill makes the container exit.
        wait_task = asyncio.create_task(asyncio.to_thread(container.wait))
        timed_out = False
        try:
            result = await asyncio.wait_for(
                asyncio.shield(wait_task),
                timeout=settings.EXECUTOR_JOB_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            timed_out = True
            logger.warning(
                f"{execution.execution_name}: still running after "
                f"{settings.EXECUTOR_JOB_TIMEOUT_SECONDS}s, killing it"
            )
            await asyncio.to_thread(self._kill, container.id)
            result = await wait_task

        exit_code = result.get("StatusCode")
        await asyncio.to_thread(self._collect, execution, container)

        if timed_out:
            self._finish(execution, ExecutionState.TIMED_OUT, exit_code)
            return self._error_message(
                execution, f"killed after {settings.EXECUTOR_JOB_TIMEOUT_SECONDS}s"
            )
        # A deliberate stop needs no callback: whoever asked for it already knows,
        # and fail_timed_out_analysis marks the jobs failed on its own.
        if execution.stop_requested:
            self._finish(execution, ExecutionState.STOPPED, exit_code)
            return None
        if exit_code == 0:
            self._finish(execution, ExecutionState.SUCCEEDED, exit_code)
            return None
        self._finish(execution, ExecutionState.FAILED, exit_code)
        return self._error_message(execution, f"exited with code {exit_code}")

    def _ensure_image(self, image: str) -> None:
        """The CI runner builds on this same daemon, so the image is normally
        already local. The pull is the fallback for a pruned or restored host."""
        try:
            self.client.images.get(image)
        except ImageNotFound:
            logger.info(f"Image {image} not present locally, pulling")
            self.client.images.pull(image)

    def _create(self, execution: Execution, image: str):
        return self.client.containers.run(
            image=image,
            name=execution.execution_name,
            environment=execution.request.env,
            detach=True,
            nano_cpus=int(settings.EXECUTOR_CPUS * 1_000_000_000),
            mem_limit=settings.EXECUTOR_MEMORY,
            # Equal to mem_limit so the limit is hard: without it the container
            # may use as much swap again and thrash instead of failing fast.
            memswap_limit=settings.EXECUTOR_MEMORY,
            labels={
                "licitaciones.execution_id": str(execution.execution_id),
                "licitaciones.analysis_id": str(execution.request.analysis_id),
                "licitaciones.service": execution.request.service_name,
            },
        )

    def _kill(self, container_id: str) -> None:
        try:
            self.client.containers.get(container_id).kill()
        except Exception as e:
            logger.warning(f"Could not kill container {container_id}: {e}")

    def _collect(self, execution: Execution, container) -> None:
        """Persist the log and drop the container. Containers run without --rm
        precisely so the exit code and the log survive long enough for this."""
        try:
            logs = container.logs(stdout=True, stderr=True)
            self._log_dir.mkdir(parents=True, exist_ok=True)
            log_path = self._log_dir / f"{execution.execution_name}.log"
            log_path.write_bytes(logs)
            execution.log_path = log_path
            execution.log_tail = "\n".join(
                logs.decode("utf-8", errors="replace").splitlines()[-LOG_TAIL_LINES:]
            )
        except Exception as e:
            logger.error(f"{execution.execution_name}: could not save the log: {e}")

        try:
            container.remove(force=True)
        except Exception as e:
            logger.error(f"{execution.execution_name}: could not remove container: {e}")

    def _error_message(self, execution: Execution, reason: str) -> str:
        location = f" Full log on VM2: {execution.log_path}." if execution.log_path else ""
        tail = f"\nLast lines:\n{execution.log_tail}" if execution.log_tail else ""
        return f"Container {execution.execution_name} {reason}.{location}{tail}"

    def _finish(
        self, execution: Execution, state: ExecutionState, exit_code: Optional[int]
    ) -> None:
        execution.state = state
        execution.exit_code = exit_code
        execution.finished_at = _now()
        logger.info(f"{execution.execution_name}: {state.value} (exit={exit_code})")

    # -- Maintenance --------------------------------------------------------

    async def run_maintenance(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self._prune_logs)
                self._prune_history()
            except Exception as e:
                logger.error(f"Maintenance cycle failed: {e}", exc_info=True)
            await asyncio.sleep(MAINTENANCE_INTERVAL_SECONDS)

    def _prune_logs(self) -> None:
        if not self._log_dir.is_dir():
            return
        cutoff = (_now() - timedelta(days=settings.EXECUTOR_LOG_RETENTION_DAYS)).timestamp()
        removed = 0
        for path in self._log_dir.glob("*.log"):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                removed += 1
        if removed:
            logger.info(f"Maintenance: removed {removed} expired job log(s)")

    def _prune_history(self) -> None:
        cutoff = _now() - timedelta(minutes=settings.EXECUTOR_HISTORY_TTL_MINUTES)
        expired: List[UUID] = [
            execution_id
            for execution_id, execution in self._executions.items()
            if execution.state in TERMINAL_STATES
            and execution.finished_at
            and execution.finished_at < cutoff
        ]
        for execution_id in expired:
            del self._executions[execution_id]
        if expired:
            logger.info(f"Maintenance: dropped {len(expired)} finished execution(s)")


job_runner = JobRunner()
