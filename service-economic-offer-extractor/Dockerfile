FROM python:3.12-slim

WORKDIR /app

# Build arguments
ARG GOOGLE_API_KEY
ARG OPENAI_API_KEY
ARG QDRANT_URL
ARG QDRANT_API_KEY
ARG API_BASE_URL
ARG API_KEY
ARG API_EVENTS_PATH
ARG API_ANALYSES_PATH
ARG API_PROPOSALS_PATH
ARG API_TENDER_CLASSIFICATIONS_PATH
ARG API_PROPOSAL_ECONOMIC_OFFERS_PATH
ARG API_JOBS_CALLBACK

# Environment variables
ENV GOOGLE_API_KEY=$GOOGLE_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV QDRANT_URL=$QDRANT_URL
ENV QDRANT_API_KEY=$QDRANT_API_KEY
ENV API_BASE_URL=$API_BASE_URL
ENV API_KEY=$API_KEY
ENV API_EVENTS_PATH=$API_EVENTS_PATH
ENV API_ANALYSES_PATH=$API_ANALYSES_PATH
ENV API_PROPOSALS_PATH=$API_PROPOSALS_PATH
ENV API_TENDER_CLASSIFICATIONS_PATH=$API_TENDER_CLASSIFICATIONS_PATH
ENV API_PROPOSAL_ECONOMIC_OFFERS_PATH=$API_PROPOSAL_ECONOMIC_OFFERS_PATH
ENV API_JOBS_CALLBACK=$API_JOBS_CALLBACK

# Validate required build arguments
RUN test -n "$GOOGLE_API_KEY" || (echo "ERROR: GOOGLE_API_KEY is required" && exit 1)
RUN test -n "$OPENAI_API_KEY" || (echo "ERROR: OPENAI_API_KEY is required" && exit 1)
RUN test -n "$QDRANT_URL" || (echo "ERROR: QDRANT_URL is required" && exit 1)
RUN test -n "$QDRANT_API_KEY" || (echo "ERROR: QDRANT_API_KEY is required" && exit 1)
RUN test -n "$API_BASE_URL" || (echo "ERROR: API_BASE_URL is required" && exit 1)
RUN test -n "$API_KEY" || (echo "ERROR: API_KEY is required" && exit 1)
RUN test -n "$API_EVENTS_PATH" || (echo "ERROR: API_EVENTS_PATH is required" && exit 1)
RUN test -n "$API_ANALYSES_PATH" || (echo "ERROR: API_ANALYSES_PATH is required" && exit 1)
RUN test -n "$API_PROPOSALS_PATH" || (echo "ERROR: API_PROPOSALS_PATH is required" && exit 1)
RUN test -n "$API_TENDER_CLASSIFICATIONS_PATH" || (echo "ERROR: API_TENDER_CLASSIFICATIONS_PATH is required" && exit 1)
RUN test -n "$API_PROPOSAL_ECONOMIC_OFFERS_PATH" || (echo "ERROR: API_PROPOSAL_ECONOMIC_OFFERS_PATH is required" && exit 1)
RUN test -n "$API_JOBS_CALLBACK" || (echo "ERROR: API_JOBS_CALLBACK is required" && exit 1)

# Validate API path formats (must start with /api/)
RUN for entry in \
      "API_EVENTS_PATH=$API_EVENTS_PATH" \
      "API_ANALYSES_PATH=$API_ANALYSES_PATH" \
      "API_PROPOSALS_PATH=$API_PROPOSALS_PATH" \
      "API_TENDER_CLASSIFICATIONS_PATH=$API_TENDER_CLASSIFICATIONS_PATH" \
      "API_PROPOSAL_ECONOMIC_OFFERS_PATH=$API_PROPOSAL_ECONOMIC_OFFERS_PATH" \
      "API_JOBS_CALLBACK=$API_JOBS_CALLBACK"; do \
    name="${entry%%=*}"; val="${entry#*=}"; \
    case "$val" in /api/*) ;; *) echo "ERROR: $name must start with /api/ (got: $val)" && exit 1 ;; esac; \
  done

# Install Python dependencies
COPY service-economic-offer-extractor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared global modules
COPY global/supabase_logger.py .

# Copy application code
COPY service-economic-offer-extractor/main.py .

# Create workspace directory
RUN mkdir -p /app/workspace

CMD ["python", "main.py"]
