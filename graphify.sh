#!/bin/bash
# La clave no vive en el repo: se exporta en el entorno o se pone en
# .env.graphify (ignorado por git).
set -e
cd /Users/genry/workspace/accsa/licitaciones
[ -f .env.graphify ] && . ./.env.graphify
: "${OPENAI_API_KEY:?falta OPENAI_API_KEY: exportala o ponela en .env.graphify}"
export OPENAI_API_KEY

graphify extract . --backend openai
graphify export html --node-limit 8000

# cd accsa-licitaciones-ui && pnpm sync:graph
# Opcional, otra fuente: pnpm sync:graph ruta/a/graph.html
