FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG GOOGLE_API_KEY
ARG OPENAI_API_KEY
ARG API_BASE_URL
ARG API_KEY
ARG API_EVENTS_PATH
ARG API_PROPOSALS_PATH
ARG API_ANALYSIS_REQUIREMENTS_PATH
ARG API_COMPLIANCE_MATRIX_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV GOOGLE_API_KEY=$GOOGLE_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_PROPOSALS_PATH=$API_PROPOSALS_PATH
ENV API_ANALYSIS_REQUIREMENTS_PATH=$API_ANALYSIS_REQUIREMENTS_PATH
ENV API_COMPLIANCE_MATRIX_PATH=$API_COMPLIANCE_MATRIX_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$GOOGLE_API_KEY" || (echo "ERROR: GOOGLE_API_KEY is required" && exit 1)
RUN test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_PROPOSALS_PATH" || (echo "ERROR: API_PROPOSALS_PATH is required" && exit 1)
RUN test -n "$API_ANALYSIS_REQUIREMENTS_PATH" || (echo "ERROR: API_ANALYSIS_REQUIREMENTS_PATH is required" && exit 1)
RUN test -n "$API_COMPLIANCE_MATRIX_PATH" || (echo "ERROR: API_COMPLIANCE_MATRIX_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Validate API path formats (must start with /api/)
RUN for entry in \
      "API_EVENTS_PATH=$API_EVENTS_PATH" \
      "API_PROPOSALS_PATH=$API_PROPOSALS_PATH" \
      "API_ANALYSIS_REQUIREMENTS_PATH=$API_ANALYSIS_REQUIREMENTS_PATH" \
      "API_COMPLIANCE_MATRIX_PATH=$API_COMPLIANCE_MATRIX_PATH" \
      "API_JOBS_CALLBACK=$API_JOBS_CALLBACK"; do \
    name="${entry%%=*}"; val="${entry#*=}"; \
    case "$val" in /api/*) ;; *) echo "ERROR: $name must start with /api/ (got: $val)" && exit 1 ;; esac; \
  done

# Install Python dependencies
COPY service-compliance-summarizer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-compliance-summarizer/main.py .

CMD ["python", "main.py"]
