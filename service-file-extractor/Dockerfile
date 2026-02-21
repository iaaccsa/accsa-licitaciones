FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG SUPABASE_ARTIFACTS_BASE_URL
ARG API_BASE_URL
ARG API_KEY
ARG API_EVENTS_PATH
ARG API_PROPOSALS_PATH
ARG API_ANALYSES_PATH
ARG API_FILES_PATH
ARG API_WORKFLOW_STEPS_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV SUPABASE_ARTIFACTS_BASE_URL=$SUPABASE_ARTIFACTS_BASE_URL
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_PROPOSALS_PATH=$API_PROPOSALS_PATH
ENV API_ANALYSES_PATH=$API_ANALYSES_PATH
ENV API_FILES_PATH=$API_FILES_PATH
ENV API_WORKFLOW_STEPS_PATH=$API_WORKFLOW_STEPS_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$SUPABASE_URL" || (echo "ERROR: SUPABASE_URL is required" && exit 1)
RUN test -n "$SUPABASE_SERVICE_ROLE_KEY" || (echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is required" && exit 1)
RUN test -n "$SUPABASE_ARTIFACTS_BASE_URL" || (echo "ERROR: SUPABASE_ARTIFACTS_BASE_URL is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_PROPOSALS_PATH" || (echo "ERROR: API_PROPOSALS_PATH is required" && exit 1)
RUN test -n "$API_ANALYSES_PATH" || (echo "ERROR: API_ANALYSES_PATH is required" && exit 1)
RUN test -n "$API_FILES_PATH" || (echo "ERROR: API_FILES_PATH is required" && exit 1)
RUN test -n "$API_WORKFLOW_STEPS_PATH" || (echo "ERROR: API_WORKFLOW_STEPS_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY service-file-extractor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-file-extractor/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
