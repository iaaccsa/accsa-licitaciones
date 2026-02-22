FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_KEY
ARG LLAMA_CLOUD_API_KEY
ARG API_BASE_URL
ARG API_KEY
ARG API_EVENTS_PATH
ARG API_FILES_PATH
ARG API_ANALYSES_PATH
ARG API_PROPOSALS_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
ENV LLAMA_CLOUD_API_KEY=$LLAMA_CLOUD_API_KEY
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_FILES_PATH=$API_FILES_PATH
ENV API_ANALYSES_PATH=$API_ANALYSES_PATH
ENV API_PROPOSALS_PATH=$API_PROPOSALS_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$SUPABASE_URL" || (echo "ERROR: SUPABASE_URL is required" && exit 1)
RUN test -n "$SUPABASE_SERVICE_KEY" || (echo "ERROR: SUPABASE_SERVICE_KEY is required" && exit 1)
RUN test -n "$LLAMA_CLOUD_API_KEY" || (echo "ERROR: LLAMA_CLOUD_API_KEY is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_FILES_PATH" || (echo "ERROR: API_FILES_PATH is required" && exit 1)
RUN test -n "$API_ANALYSES_PATH" || (echo "ERROR: API_ANALYSES_PATH is required" && exit 1)
RUN test -n "$API_PROPOSALS_PATH" || (echo "ERROR: API_PROPOSALS_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Validate API path formats (must start with /api/)
RUN for entry in \
      "API_EVENTS_PATH=$API_EVENTS_PATH" \
      "API_FILES_PATH=$API_FILES_PATH" \
      "API_ANALYSES_PATH=$API_ANALYSES_PATH" \
      "API_PROPOSALS_PATH=$API_PROPOSALS_PATH" \
      "API_JOBS_CALLBACK=$API_JOBS_CALLBACK"; do \
    name="${entry%%=*}"; val="${entry#*=}"; \
    case "$val" in /api/*) ;; *) echo "ERROR: $name must start with /api/ (got: $val)" && exit 1 ;; esac; \
  done

# Install Python dependencies
COPY service-files-converter/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-files-converter/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
