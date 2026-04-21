"""
Digital Signature Extractor Service
=====================================
Downloads original PDF files from Supabase Storage, extracts embedded digital
signatures (PAdES/CAdES), and persists the result to original_files and all
associated processed_files via the backend API.

Required environment variables:
  - SUPABASE_URL             : Supabase project URL
  - SUPABASE_SERVICE_KEY     : Service role key for authenticated access
  - API_BASE_URL             : Backend API base URL
  - API_KEY                  : API key for backend authentication
  - API_EVENTS_PATH          : Path for events endpoint
  - API_ANALYSES_PATH        : Path for analyses endpoint
  - API_ORIGINAL_FILES_PATH  : Path for original files endpoint
  - API_PROCESSED_FILES_PATH : Path for processed files endpoint
  - API_JOBS_CALLBACK        : Path for job status callback
  - ANALYSIS_ID              : UUID of the analysis (runtime)
  - FILE_ID                  : UUID of the original_file to process (runtime)
"""

import io
import os
import sys
from datetime import datetime, timezone

import requests
from supabase import create_client, Client
from supabase_logger import setup_logger, log_event, make_session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
API_BASE_URL = os.environ.get("API_BASE_URL")
API_KEY = os.environ.get("API_KEY")
API_EVENTS_PATH = os.environ.get("API_EVENTS_PATH")
API_ANALYSES_PATH = os.environ.get("API_ANALYSES_PATH")
API_ORIGINAL_FILES_PATH = os.environ.get("API_ORIGINAL_FILES_PATH")
API_PROCESSED_FILES_PATH = os.environ.get("API_PROCESSED_FILES_PATH")
API_JOBS_CALLBACK = os.environ.get("API_JOBS_CALLBACK")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")
FILE_ID = os.environ.get("FILE_ID")

SERVICE_NAME = "service-digital-signature-extractor"
EVENT_SOURCE = f"ACA: {SERVICE_NAME}"
STORAGE_BUCKET = "files"

logger = setup_logger(SERVICE_NAME)
SESSION = make_session()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY or "",
}


def api_request(method: str, path: str, json_data: dict | list | None = None) -> dict | list | None:
    url = f"{API_BASE_URL}{path}"
    response = SESSION.request(method, url, json=json_data, headers=API_HEADERS, timeout=30)
    response.raise_for_status()
    try:
        return response.json()
    except ValueError:
        return None


def validate_env():
    required = [
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
        ("API_BASE_URL", API_BASE_URL),
        ("API_KEY", API_KEY),
        ("API_EVENTS_PATH", API_EVENTS_PATH),
        ("API_ANALYSES_PATH", API_ANALYSES_PATH),
        ("API_ORIGINAL_FILES_PATH", API_ORIGINAL_FILES_PATH),
        ("API_PROCESSED_FILES_PATH", API_PROCESSED_FILES_PATH),
        ("API_JOBS_CALLBACK", API_JOBS_CALLBACK),
        ("ANALYSIS_ID", ANALYSIS_ID),
        ("FILE_ID", FILE_ID),
    ]
    missing = [name for name, val in required if not val]
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def _cert_subject_field(subject_native: dict, *keys: str) -> str | None:
    for key in keys:
        val = subject_native.get(key)
        if val:
            return str(val)
    return None


def extract_signatures(pdf_bytes: bytes) -> dict:
    """
    Extract digital signatures from a PDF using pyhanko.
    Does not perform network-based revocation checks.
    Returns a dict ready to be stored as digital_signatures.
    """
    from pyhanko.pdf_utils.reader import PdfFileReader

    result: dict = {
        "has_signatures": False,
        "signatures": [],
        "extraction_status": "no_signatures",
        "extraction_error": None,
    }

    try:
        reader = PdfFileReader(io.BytesIO(pdf_bytes), strict=False)
        embedded_sigs = reader.embedded_signatures

        if not embedded_sigs:
            return result

        result["has_signatures"] = True
        result["extraction_status"] = "success"

        for sig in embedded_sigs:
            sig_data: dict = {}

            try:
                cert = sig.signer_cert
            except Exception:
                cert = None

            if cert is not None:
                subject = cert.subject.native
                issuer = cert.issuer.native

                sig_data["signer_name"] = _cert_subject_field(subject, "common_name")
                sig_data["organization"] = _cert_subject_field(
                    subject, "organization_name", "organizational_unit_name"
                )
                # serial_number in X.509 subject = national ID / tax ID in many LatAm CAs
                sig_data["tax_id"] = _cert_subject_field(subject, "serial_number")
                sig_data["email"] = _cert_subject_field(subject, "email_address")
                sig_data["certificate_issuer"] = _cert_subject_field(
                    issuer, "organization_name", "common_name"
                )

                now = datetime.now(timezone.utc)
                try:
                    validity = cert["tbs_certificate"]["validity"]
                    not_before = validity["not_before"].native
                    not_after = validity["not_after"].native
                    sig_data["is_valid"] = not_before <= now <= not_after
                except Exception:
                    sig_data["is_valid"] = None

            try:
                ts = sig.self_reported_timestamp
                sig_data["signing_time"] = ts.isoformat() if ts else None
            except Exception:
                sig_data["signing_time"] = None

            try:
                subfilter = str(sig.sig_object.get("/SubFilter", "")).strip("/").lower()
                if "pades" in subfilter or "etsi" in subfilter:
                    sig_data["signature_type"] = "PAdES"
                elif "pkcs7" in subfilter:
                    sig_data["signature_type"] = "CMS"
                else:
                    sig_data["signature_type"] = subfilter or "unknown"
            except Exception:
                sig_data["signature_type"] = "unknown"

            result["signatures"].append(sig_data)

    except Exception as e:
        logger.error(f"Signature extraction error: {e}")
        result["extraction_status"] = "failed"
        result["extraction_error"] = str(e)

    return result


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
def notify_failure(error_msg: str):
    logger.error(f"notify_failure: {error_msg}")
    log_event(ANALYSIS_ID, "error", error_msg, EVENT_SOURCE)
    try:
        api_request(
            "PATCH",
            f"{API_ANALYSES_PATH}{ANALYSIS_ID}/status",
            {"status": "ready", "is_success": False},
        )
    except Exception as e:
        logger.error(f"Failed to update analysis status: {e}")
    try:
        api_request("POST", API_JOBS_CALLBACK, {
            "service_name": SERVICE_NAME,
            "analysis_id": ANALYSIS_ID,
            "file_id": FILE_ID,
            "status": "failed",
            "error_message": error_msg,
        })
    except Exception as e:
        logger.error(f"Failed to notify job callback: {e}")


def process_file():
    logger.info(f"Starting digital signature extraction — file_id={FILE_ID}, analysis_id={ANALYSIS_ID}")
    log_event(
        ANALYSIS_ID,
        "info",
        f"Iniciando extraccion de firmas digitales para archivo {FILE_ID}",
        EVENT_SOURCE,
    )

    # 1. Fetch original file record to get storage_path
    original_file = api_request("GET", f"{API_ORIGINAL_FILES_PATH}{FILE_ID}")
    storage_path: str = original_file["storage_path"]
    file_name: str = original_file["file_name"]
    logger.info(f"File: {file_name} | path: {storage_path}")

    # 2. Download PDF from Supabase Storage
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    pdf_bytes: bytes = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
    logger.info(f"Downloaded {len(pdf_bytes)} bytes")

    # 3. Extract signatures (no network calls — cert period check only)
    digital_signatures = extract_signatures(pdf_bytes)
    sig_count = len(digital_signatures["signatures"])
    logger.info(
        f"Extraction: status={digital_signatures['extraction_status']}, count={sig_count}"
    )
    log_event(
        ANALYSIS_ID,
        "info",
        f"Firmas encontradas en {file_name}: {sig_count}",
        EVENT_SOURCE,
        {"extraction_status": digital_signatures["extraction_status"], "count": sig_count},
    )

    # 4. Patch original_file
    api_request(
        "PATCH",
        f"{API_ORIGINAL_FILES_PATH}{FILE_ID}",
        {"digital_signatures": digital_signatures},
    )
    logger.info("Patched original_file.digital_signatures")

    # 5. Patch all associated processed_files
    processed_files = api_request(
        "POST",
        f"{API_PROCESSED_FILES_PATH}search",
        {"original_file_id": FILE_ID},
    )
    if processed_files:
        for pf in processed_files:
            api_request(
                "PATCH",
                f"{API_PROCESSED_FILES_PATH}{pf['id']}",
                {"digital_signatures": digital_signatures},
            )
        logger.info(f"Patched {len(processed_files)} processed_file(s)")
    else:
        logger.info("No associated processed_files found")

    # 6. Notify success
    api_request("POST", API_JOBS_CALLBACK, {
        "service_name": SERVICE_NAME,
        "analysis_id": ANALYSIS_ID,
        "file_id": FILE_ID,
        "status": "success",
    })
    log_event(
        ANALYSIS_ID,
        "info",
        f"Extraccion de firmas digitales completada para {file_name}",
        EVENT_SOURCE,
    )
    logger.info("Digital signature extraction complete")


def main():
    validate_env()
    try:
        process_file()
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP error: {e}"
        if hasattr(e, "response") and e.response is not None:
            error_msg += f" — {e.response.text}"
        notify_failure(error_msg)
        sys.exit(0)
    except Exception as e:
        notify_failure(f"Failed: {str(e)}")
        sys.exit(0)


if __name__ == "__main__":
    main()
