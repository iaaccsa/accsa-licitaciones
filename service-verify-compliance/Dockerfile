FROM python:3.12-slim

WORKDIR /app

# Service Name Argument
ENV SERVICE_NAME="service-verify-compliance"

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG LLAMA_CLOUD_API_KEY
ARG OPENAI_API_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY

ARG COHERE_API_KEY

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV LLAMA_CLOUD_API_KEY=$LLAMA_CLOUD_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY

ENV COHERE_API_KEY=$COHERE_API_KEY

# Validate required build arguments
RUN test -n "$SUPABASE_URL" || (echo "ERROR: SUPABASE_URL is required" && exit 1) && \
    test -n "$SUPABASE_SERVICE_ROLE_KEY" || (echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is required" && exit 1) && \
    test -n "$LLAMA_CLOUD_API_KEY" || (echo "ERROR: LLAMA_CLOUD_API_KEY is required" && exit 1) && \
    test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1) && \
    test -n "$QDRANT_URL" || (echo "ERROR: QDRANT_URL is required" && exit 1) && \
    test -n "$QDRANT_API_KEY" || (echo "ERROR: QDRANT_API_KEY is required" && exit 1) && \
    test -n "$COHERE_API_KEY" || (echo "ERROR: COHERE_API_KEY is required" && exit 1)

# Install Python dependencies
COPY ${SERVICE_NAME}/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY ${SERVICE_NAME}/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
