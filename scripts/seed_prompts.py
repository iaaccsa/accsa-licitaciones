"""Seed the `service_prompts` table from the .md files baked in each service.

Run ONCE after deploying the API (FASE 1). Idempotent: PUT upserts by key.
The .md originals contain their placeholders, so they pass server validation.

Usage (from repo root accsa-licitaciones-services/, with API up):
    API_BASE_URL=http://localhost:8000 API_KEY=<BACKEND_API_KEY> \
      python scripts/seed_prompts.py
"""
import os
import sys
from pathlib import Path

import requests

API_BASE_URL = os.environ.get("API_BASE_URL", "")
API_KEY = os.environ.get("API_KEY", "")
API_PROMPTS_PATH = os.environ.get("API_PROMPTS_PATH", "/api/v1/prompts")

REPO_ROOT = Path(__file__).resolve().parent.parent

# key = "service-slug/stem". required_placeholders declared explicitly per prompt.
PROMPTS = [
    {
        "key": "service-compliance-summarizer/compliance_summary",
        "service": "service-compliance-summarizer",
        "filename": "prompt_compliance_summary.md",
        "title": "Resumen de cumplimiento",
        "description": "Genera el resumen final de cumplimiento por propuesta.",
        "required_placeholders": [],
    },
    {
        "key": "service-tender-classifier/tender_evaluation_profile",
        "service": "service-tender-classifier",
        "filename": "prompt_tender_evaluation_profile.md",
        "title": "Perfil de evaluacion del pliego",
        "description": "Construye el perfil de evaluacion del pliego.",
        "required_placeholders": [],
    },
    {
        "key": "service-admissibility-matcher/compliance_evaluator",
        "service": "service-admissibility-matcher",
        "filename": "prompt_compliance_evaluator.md",
        "title": "Evaluador de admisibilidad",
        "description": "Evalua cumplimiento de requisitos de admisibilidad vs propuesta.",
        "required_placeholders": [],
    },
    {
        "key": "service-documents-classifier/document_category_classifier",
        "service": "service-documents-classifier",
        "filename": "prompt_document_category_classifier.md",
        "title": "Clasificador de documentos",
        "description": "Clasifica cada documento en su categoria.",
        "required_placeholders": [
            "company_name", "company_role", "document_purpose",
            "document_type", "file_name", "summary",
        ],
    },
    {
        "key": "service-requirement-extractor/admissibility_extractor",
        "service": "service-requirement-extractor",
        "filename": "prompt_admissibility_extractor.md",
        "title": "Extractor de admisibilidad",
        "description": "Extrae requisitos de admisibilidad del pliego.",
        "required_placeholders": [],
    },
    {
        "key": "service-requirement-extractor/requirements_extractor",
        "service": "service-requirement-extractor",
        "filename": "prompt_requirements_extractor.md",
        "title": "Extractor de requisitos generales",
        "description": "Extrae requisitos generales del pliego.",
        "required_placeholders": [],
    },
    {
        "key": "service-compliance-matcher/compliance_evaluator",
        "service": "service-compliance-matcher",
        "filename": "prompt_compliance_evaluator.md",
        "title": "Evaluador de cumplimiento general",
        "description": "Evalua cumplimiento de requisitos generales vs propuesta.",
        "required_placeholders": [],
    },
    {
        "key": "service-file-metadata-extractor/file_metadata_extractor",
        "service": "service-file-metadata-extractor",
        "filename": "prompt_file_metadata_extractor.md",
        "title": "Extractor de metadatos de archivo",
        "description": "Extrae metadatos (empresa, rol, proposito) de cada archivo.",
        "required_placeholders": ["text"],
    },
    {
        "key": "service-economic-offer-extractor/economic_offer_extractor",
        "service": "service-economic-offer-extractor",
        "filename": "prompt_economic_offer_extractor.md",
        "title": "Extractor de oferta economica",
        "description": "Extrae la oferta economica de la propuesta.",
        "required_placeholders": [],
    },
    {
        "key": "service-documents-grouper/proposal_grouping",
        "service": "service-documents-grouper",
        "filename": "prompt_proposal_grouping.md",
        "title": "Agrupador de propuestas",
        "description": "Agrupa archivos en propuestas (oferentes).",
        "required_placeholders": ["files_json"],
    },
    {
        "key": "service-documents-grouper/tender_naming",
        "service": "service-documents-grouper",
        "filename": "prompt_tender_naming.md",
        "title": "Identificacion de archivos del pliego",
        "description": "Identifica/nombra los archivos del pliego.",
        "required_placeholders": ["files_json"],
    },
]


def main() -> int:
    missing = [n for v, n in [(API_BASE_URL, "API_BASE_URL"), (API_KEY, "API_KEY")] if not v]
    if missing:
        print(f"Missing env vars: {', '.join(missing)}")
        return 1

    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    failures = 0

    for p in PROMPTS:
        md_path = REPO_ROOT / p["service"] / p["filename"]
        body = md_path.read_text(encoding="utf-8")
        payload = {
            "service": p["service"],
            "filename": p["filename"],
            "title": p["title"],
            "description": p["description"],
            "required_placeholders": p["required_placeholders"],
            "body": body,
        }
        url = f"{API_BASE_URL}{API_PROMPTS_PATH}/{p['key']}"
        resp = requests.put(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            print(f"OK   {p['key']}")
        else:
            failures += 1
            print(f"FAIL {p['key']} -> {resp.status_code} {resp.text}")

    print(f"\nSeeded {len(PROMPTS) - failures}/{len(PROMPTS)} prompts.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
