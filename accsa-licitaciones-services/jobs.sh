#!/bin/bash
set -e

SERVICES=(
  "service-file-extractor"
  "service-files-converter-llama"
  "service-files-converter-mistral"
  "service-chunk-and-index"
  "service-setup-qdrant"
  "service-requirement-extractor"
  "service-verify-compliance"
  "service-metadata-extractor"
  "service-proposal-scorer"
  "service-qdrant-by-file"
  "service-file-metadata-extractor"
  "service-documents-classifier"
  "service-documents-grouper"
  "service-joiner"
  "service-tender-classifier"
  "service-compliance-matcher"
  "service-compliance-summarizer"
)

for svc in "${SERVICES[@]}"; do
  echo ">>> Creating job: $svc"
  ./create-azure-container-app-job.sh "$svc"
done

echo "All jobs created."
