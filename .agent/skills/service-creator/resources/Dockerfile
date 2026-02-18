FROM python:3.12-slim

WORKDIR /app

# Service Name Argument
ENV SERVICE_NAME="<SERVICE_NAME>"

# Build arguments
ARG SUPABASE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG LLAMA_CLOUD_API_KEY
ARG OPENAI_API_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY

# Environment variables
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV LLAMA_CLOUD_API_KEY=$LLAMA_CLOUD_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY

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
