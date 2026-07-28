FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY service-admissibility-gate/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY VERSION .
COPY global/supabase_logger.py .

# Copy application code
COPY service-admissibility-gate/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
