FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG OPENAI_API_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY
ARG API_BASE_URL
ARG API_KEY
ARG API_EVENTS_PATH
ARG API_ANALYSES_PATH
ARG API_REQUIREMENTS_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_ANALYSES_PATH=$API_ANALYSES_PATH
ENV API_REQUIREMENTS_PATH=$API_REQUIREMENTS_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1)
RUN test -n "$QDRANT_URL" || (echo "ERROR: QDRANT_URL is required" && exit 1)
RUN test -n "$QDRANT_API_KEY" || (echo "ERROR: QDRANT_API_KEY is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_ANALYSES_PATH" || (echo "ERROR: API_ANALYSES_PATH is required" && exit 1)
RUN test -n "$API_REQUIREMENTS_PATH" || (echo "ERROR: API_REQUIREMENTS_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Install Python dependencies
COPY service-iterative-requirement-extractor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-iterative-requirement-extractor/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
