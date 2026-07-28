# Arquitectura del sistema

> Origen: página `/docs/architecture` de la UI, retirada el 2026-07-09. Documento interno.

Visión general de los tres proyectos, el pipeline de procesamiento de licitaciones, la infraestructura compartida y el flujo de datos de punta a punta.

## Los tres proyectos

| Proyecto | Stack | Descripción |
|---|---|---|
| `accsa-licitaciones-ui` | Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui | Dashboard en el navegador. Sube ZIPs, muestra estado del workflow, requisitos, propuestas y matriz de cumplimiento. Todas las llamadas a la API se hacen server-side. |
| `accsa-licitaciones-api` | FastAPI, Python, Supabase, Qdrant, Azure | Orquestador central. Recibe uploads, gestiona el pipeline via jobs, sirve datos a la UI y expone endpoints REST. |
| `accsa-licitaciones-services` | Python 3.12, Docker, Azure Container Apps Jobs | 13 microservicios que corren como jobs efímeros. Cada uno ejecuta una etapa del pipeline y escribe resultados a Supabase y Qdrant. |

## Pipeline de procesamiento

13 servicios encadenados en un DAG que transforma documentos crudos en una matriz de cumplimiento evaluada. Los gates HITL pausan para revisión humana.

### Bloque A - Ingesta y preparación documental

1. `service-file-extractor`: desempaqueta archivos del pliego y propuestas a almacenamiento.
2. `service-files-converter-mistral`: convierte PDFs/DOCX/imágenes a markdown via Mistral OCR.
3. `service-qdrant-by-file`: indexa cada archivo en Qdrant (colecciones `FILE_*`). Fan-out por archivo.
4. `service-file-metadata-extractor`: extrae metadatos estructurados de cada archivo. Fan-out por archivo.
5. `service-digital-sig-extractor`: parsea firmas digitales PAdES/CAdES. Fan-out por archivo.

### Bloque B - Clasificación y agrupación

6. `service-documents-classifier`: clasifica cada archivo según su rol (pliego, propuesta, normativa, etc.).
7. `service-documents-grouper`: agrupa archivos en conjuntos lógicos. Gate HITL para revisión humana.

### Bloque C - Análisis del pliego

8. `service-tender-classifier`: detecta el perfil de evaluación (puntos, porcentajes, solo precio, etc.).
9. `service-requirement-extractor`: extrae requisitos atómicos y los clasifica por rol, dominio y peso. Gate HITL.

### Bloque D - Evaluación de propuestas

10. `service-build-proposal-index`: copia chunks de cada propuesta a colecciones `PROPOSAL_*` en Qdrant.
11. `service-compliance-matcher`: evalúa cada requisito contra cada propuesta via RAG + LLM. Fan-out por propuesta.
12. `service-admissibility-gate`: aplica reglas de admisibilidad formal y emite veredicto por propuesta.
13. `service-compliance-summarizer`: genera resumen narrativo y métricas agregadas por propuesta.

## Infraestructura compartida

- **Supabase** (PostgreSQL + Storage): almacén canónico de datos. Tablas: `analyses`, `files`, `proposals`, `requirements`, `compliance_results`, `workflow_steps`, `admissibility_requirements`, `admissibility_results`.
- **Qdrant** (Vector DB, AWS sa-east-1): búsqueda semántica. Colecciones `FILE_{slug}_{file_id}` (por archivo) y `PROPOSAL_{slug}_{proposal_id}` (por propuesta). Vectores de 1536 dimensiones con `text-embedding-3-small`.
- **Azure Container Apps** (`env-licitaciones`, eastus): ejecución de microservicios como jobs efímeros. Imágenes en ACR: `accsalicitaciones.azurecr.io`.
- **LLM providers** (OpenAI, Gemini, Mistral): OpenAI para embeddings y razonamiento; Google Gemini para clasificación de documentos; Mistral para OCR de PDFs.

## Flujo de datos

```
UI (sube ZIP)
  -> API (guarda en Supabase, inicializa workflow_steps)
    -> pipeline via Azure Container Apps Jobs:
        file-extractor -> converter-mistral
          -> qdrant-by-file  (fan-out por archivo -> colecciones FILE_*)
              |- file-metadata-extractor
              |- digital-sig-extractor
                  -> documents-classifier
                    -> documents-grouper  [HITL]
                      |- tender-classifier -> requirement-extractor  [HITL]
                      |- build-proposal-index  (fan-out -> colecciones PROPOSAL_*)
                            v (join: requirement-extractor + build-proposal-index)
                          compliance-matcher  (fan-out por propuesta)  [HITL]
                            -> admissibility-gate
                              -> compliance-summarizer
  <- callback API -> UI muestra resultados
```

Cada servicio lee su input de Supabase y Qdrant, escribe resultados, y hace `POST /jobs/callback` a la API para disparar el siguiente paso. La UI no contacta directamente a los servicios ni a Supabase; todo va via API proxy.
