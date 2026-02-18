"""
<SERVICE_NAME> Service
===============================
Description of the service.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - ANALYSIS_ID
"""

import os
import sys
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

# Try to import shared logger
try:
    from supabase_logger import setup_logger, log_event, mark_failed
except ImportError:
    # Fallback for local testing
    def setup_logger(name):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(handler)
        return logger
    def log_event(supabase, analysis_id, level, message, source, details=None):
        print(f"[{level.upper()}] {source}: {message}")
    def mark_failed(supabase, analysis_id, message, source):
        print(f"[FAILED] {source}: {message}")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EVENT_SOURCE = "ACA: <SERVICE_NAME>"

# Load env vars
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ANALYSIS_ID = os.environ.get("ANALYSIS_ID")

logger = setup_logger("<SERVICE_NAME_SLUG>")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_env():
    """Ensure all required environment variables are set."""
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not ANALYSIS_ID: missing.append("ANALYSIS_ID")

    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    validate_env()
    logger.info(f"Starting <SERVICE_NAME> for ANALYSIS_ID={ANALYSIS_ID}")
    
    supabase = get_supabase_client()
    
    try:
        log_event(supabase, ANALYSIS_ID, "info", "Starting service...", EVENT_SOURCE)
        
        # Your service logic here
        logger.info("Service logic executed successfully.")
        
        log_event(supabase, ANALYSIS_ID, "info", "Service completed successfully.", EVENT_SOURCE)

    except Exception as e:
        error_msg = f"Fatal error in <SERVICE_NAME>: {str(e)}"
        logger.error(error_msg)
        mark_failed(supabase, ANALYSIS_ID, error_msg, EVENT_SOURCE)
        sys.exit(1)

if __name__ == "__main__":
    main()
