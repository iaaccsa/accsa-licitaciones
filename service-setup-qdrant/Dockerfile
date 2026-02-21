FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY

# Validate required build arguments
RUN test -n "$SUPABASE_URL" || (echo "ERROR: SUPABASE_URL is required" && exit 1)
RUN test -n "$SUPABASE_SERVICE_KEY" || (echo "ERROR: SUPABASE_SERVICE_KEY is required" && exit 1)
RUN test -n "$QDRANT_URL" || (echo "ERROR: QDRANT_URL is required" && exit 1)
RUN test -n "$QDRANT_API_KEY" || (echo "ERROR: QDRANT_API_KEY is required" && exit 1)

# Install Python dependencies
COPY service-setup-qdrant/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-setup-qdrant/main.py .

CMD ["python", "main.py"]
