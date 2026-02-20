FROM python:3.12-slim

WORKDIR /app

# Env vars for build (optional if only needed at runtime, but good practice to declare)
ENV PYTHONUNBUFFERED=1

# Build Arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG OPENAI_API_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY
ARG API_URL_GET_FILES_FOR_RAG

# Set Environment Variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY
ENV API_URL_GET_FILES_FOR_RAG=$API_URL_GET_FILES_FOR_RAG

# Validate required build arguments
RUN test -n "$SUPABASE_URL" || (echo "ERROR: SUPABASE_URL is required" && exit 1)
RUN test -n "$SUPABASE_SERVICE_ROLE_KEY" || (echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is required" && exit 1)
RUN test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1)
RUN test -n "$QDRANT_URL" || (echo "ERROR: QDRANT_URL is required" && exit 1)
RUN test -n "$QDRANT_API_KEY" || (echo "ERROR: QDRANT_API_KEY is required" && exit 1)
RUN test -n "$API_URL_GET_FILES_FOR_RAG" || (echo "ERROR: API_URL_GET_FILES_FOR_RAG is required" && exit 1)

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY service-chunk-and-index/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy logic
COPY service-chunk-and-index/main.py .

# Copy shared logger
COPY global/supabase_logger.py .

CMD ["python", "main.py"]
