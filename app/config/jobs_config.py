import json
from pathlib import Path
from typing import List, Dict, Optional

_PIPELINE_CONFIG_PATH = Path(__file__).parent / "pipeline_config.json"

with open(_PIPELINE_CONFIG_PATH, "r") as f:
    _pipeline_config: List[Dict] = json.load(f)

# Exclude virtual steps (is_initial=True, e.g. service-queue) — not real Azure jobs
_jobs_config = [entry for entry in _pipeline_config if not entry.get("is_initial", False)]

# Build lookup: service_name -> list of next services
_next_services_map: Dict[str, List[str]] = {}
# Track all services that appear as "next_services" (i.e., they have a predecessor)
_services_with_predecessors: set = set()

for entry in _jobs_config:
    service = entry["service"]
    next_services = entry.get("next_services", [])
    _next_services_map[service] = next_services
    for ns in next_services:
        _services_with_predecessors.add(ns)

# All known service names
_all_services: List[str] = [entry["service"] for entry in _jobs_config]


def get_root_jobs() -> List[str]:
    """Return jobs that have no predecessors (entry points of the pipeline)."""
    return [s for s in _all_services if s not in _services_with_predecessors]


def get_next_jobs(job_name: str) -> List[str]:
    """Return the list of jobs that should run after the given job completes."""
    return _next_services_map.get(job_name, [])


def get_all_jobs() -> List[str]:
    """Return all job names in pipeline order."""
    return list(_all_services)


def is_valid_job(job_name: str) -> bool:
    """Check if a job name exists in the tree."""
    return job_name in _next_services_map


def is_final_job(job_name: str) -> bool:
    """Return True if the job is marked as is_final in the pipeline config."""
    return any(entry["service"] == job_name and entry.get("is_final", False) for entry in _jobs_config)
