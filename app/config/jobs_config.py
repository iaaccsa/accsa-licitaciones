import json
from pathlib import Path
from typing import List, Dict, Optional

_JOBS_TREE_PATH = Path(__file__).parent / "jobs_tree.json"

with open(_JOBS_TREE_PATH, "r") as f:
    _jobs_tree: List[Dict] = json.load(f)

# Build lookup: job_name -> list of next jobs
_next_jobs_map: Dict[str, List[str]] = {}
# Track all jobs that appear as "next" (i.e., they have a predecessor)
_jobs_with_predecessors: set = set()

for entry in _jobs_tree:
    current = entry["current"]
    next_jobs = entry.get("next", [])
    _next_jobs_map[current] = next_jobs
    for nj in next_jobs:
        _jobs_with_predecessors.add(nj)

# All known job names
_all_jobs: List[str] = [entry["current"] for entry in _jobs_tree]


def get_root_jobs() -> List[str]:
    """Return jobs that have no predecessors (entry points of the pipeline)."""
    return [job for job in _all_jobs if job not in _jobs_with_predecessors]


def get_next_jobs(job_name: str) -> List[str]:
    """Return the list of jobs that should run after the given job completes."""
    return _next_jobs_map.get(job_name, [])


def get_all_jobs() -> List[str]:
    """Return all job names in pipeline order."""
    return list(_all_jobs)


def is_valid_job(job_name: str) -> bool:
    """Check if a job name exists in the tree."""
    return job_name in _next_jobs_map
