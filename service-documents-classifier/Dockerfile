FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG GOOGLE_API_KEY
ARG OPENAI_API_KEY
ARG API_BASE_URL
ARG API_KEY
ARG API_PROMPTS_PATH=/api/v1/prompts
ARG API_EVENTS_PATH
ARG API_ANALYSES_PATH
ARG API_PROCESSED_FILES_PATH
ARG API_ORIGINAL_FILES_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV GOOGLE_API_KEY=$GOOGLE_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_PROMPTS_PATH=$API_PROMPTS_PATH
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_ANALYSES_PATH=$API_ANALYSES_PATH
ENV API_PROCESSED_FILES_PATH=$API_PROCESSED_FILES_PATH
ENV API_ORIGINAL_FILES_PATH=$API_ORIGINAL_FILES_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$GOOGLE_API_KEY" || (echo "ERROR: GOOGLE_API_KEY is required" && exit 1)
RUN test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_ANALYSES_PATH" || (echo "ERROR: API_ANALYSES_PATH is required" && exit 1)
RUN test -n "$API_PROCESSED_FILES_PATH" || (echo "ERROR: API_PROCESSED_FILES_PATH is required" && exit 1)
RUN test -n "$API_ORIGINAL_FILES_PATH" || (echo "ERROR: API_ORIGINAL_FILES_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Install Python dependencies
COPY service-documents-classifier/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY VERSION .
COPY global/supabase_logger.py .
COPY global/ai_usage_logger.py .
COPY global/prompt_loader.py .

# Copy application code
COPY service-documents-classifier/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
