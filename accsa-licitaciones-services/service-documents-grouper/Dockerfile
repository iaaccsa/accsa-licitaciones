FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY service-documents-grouper/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY VERSION .
COPY global/supabase_logger.py .
COPY global/ai_usage_logger.py .
COPY global/prompt_loader.py .

# Copy application code
COPY service-documents-grouper/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
