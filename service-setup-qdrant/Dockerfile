FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY

# Install Python dependencies
COPY service-setup-qdrant/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-setup-qdrant/setup_qdrant.py .

CMD ["python", "setup_qdrant.py"]
