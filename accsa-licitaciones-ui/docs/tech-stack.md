# Stack tecnológico

> Origen: página `/docs/tech` de la UI, retirada el 2026-07-09. Documento interno.

Tecnologías utilizadas en los tres repositorios del proyecto.

## Frontend (`accsa-licitaciones-ui`)

| Tecnología | Uso |
|---|---|
| Next.js 16 | Framework principal con App Router. Routing por sistema de archivos, API Routes como proxy autenticado hacia el backend, Server y Client Components. |
| React 19 | Librería de UI. Estado local con useState/useEffect. |
| TypeScript 5 | Tipado estático en todo el proyecto. |
| Tailwind CSS 4 | Utilidades CSS para todo el diseño. Paleta base zinc. Configurado con @import en globals.css. |
| @tailwindcss/typography | Clases prose para renderizar respuestas del chat en Markdown. |
| shadcn/ui + Radix UI | Componentes accesibles (Button, Badge, Card, Separator, Skeleton). Primitiva react-slot para composición. |
| @supabase/ssr + supabase-js | Cliente de Supabase Auth y sesión server-side (cookies). Resuelve el usuario y protege rutas en API Routes y Server Components. |
| SWR | Fetching y caché de datos en el cliente con revalidación automática (análisis, propuestas, resultados). |
| Zod | Validación y parseo tipado de los cuerpos de request en las API Routes antes de reenviar al backend. |
| class-variance-authority + clsx + tailwind-merge | Variantes de componentes tipadas y combinación de clases Tailwind sin conflictos. |
| Recharts 3 | Gráficos de cumplimiento de propuestas (RadarChart / BarChart). |
| JSZip 3 | Empaqueta los PDFs en un ZIP en el cliente antes de enviarlos. Cargado lazy. |
| react-markdown 10 | Renderiza las respuestas del chat (Markdown) como HTML con clases prose. |
| lucide-react | Iconos SVG como componentes React. |
| tw-animate-css | Animaciones CSS como plugin de Tailwind. |
| Vercel | Despliegue del frontend. Build y deploy automático en cada push a main. |

## Backend API (`accsa-licitaciones-api`)

| Tecnología | Uso |
|---|---|
| FastAPI (Python) | Framework REST principal. Endpoints bajo /api/v1, manejo de errores, CORS, dependencias para autenticación. Los microservicios se comunican exclusivamente con esta API. |
| Uvicorn | Servidor ASGI en desarrollo y producción. |
| Pydantic v2 | Validación y serialización en schemas de request/response. También define el schema de salida estructurada del LLM. |
| pydantic-settings | Carga y validación de variables de entorno desde .env. |
| python-multipart | Recepción de archivos via multipart/form-data (upload de ZIPs). |
| python-dotenv | Carga el .env al iniciar la aplicación. |
| Vercel | Despliegue de la API como funciones serverless, deploy automático en cada push a main. |

## Inteligencia Artificial

| Tecnología | Uso |
|---|---|
| OpenAI text-embedding-3-small | Embeddings (1536 dimensiones) para indexar chunks en Qdrant y para la búsqueda semántica del chat RAG. |
| OpenAI y Google Gemini (multi-proveedor) | LLMs seleccionables por el usuario. Cada tarea corre en un nivel (bajo / medio / alto) con modelo primario y fallback cruzado entre proveedores (ver model-tiers.md). Extracción de requisitos, verificación de cumplimiento con salida JSON estructurada, resúmenes en Markdown y chat RAG. |
| Mistral OCR | Conversión de PDFs a Markdown estructurado (service-files-converter-mistral). Preserva tablas, headers y formato. |
| langchain-text-splitters | Chunking semántico: MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter. |
| pyHanko | Validación y extracción de firmas digitales de PDFs (service-digital-sig-extractor). |

## Bases de datos y almacenamiento

| Tecnología | Uso |
|---|---|
| Supabase (PostgreSQL) | Base principal: análisis, propuestas, archivos, requisitos, compliance, workflow steps, eventos, jobs. Storage para ZIPs y Markdown procesados (NEXT_PUBLIC_SUPABASE_STORAGE_URL). |
| Qdrant | Base vectorial: chunks con embeddings para búsqueda semántica. Colecciones por análisis nombradas por slug. Vectores de 1536 dimensiones. |
| Redis (Upstash) | Historial de conversaciones del chat con file_id como clave de sesión (chat_history:{file_id}); el LLM recibe los últimos 20 mensajes. |

## Infraestructura y despliegue

| Tecnología | Uso |
|---|---|
| Azure Container Apps Jobs | Runtime de cada microservicio. Contenedores efímeros disparados on-demand por la API (job_orchestrator_service) via Azure Management API, encadenados por callbacks a /jobs/callback. |
| Azure Container Registry | Registro privado de imágenes: accsalicitaciones.azurecr.io/services/<nombre>:latest. |
| Azure Pipelines | CI/CD: build y push paralelo de todas las imágenes al ACR en cada push a main (estrategia matrix). |
| Azure Identity | ClientSecretCredential (service principal) para lanzar y gestionar los jobs desde la API. |
| Docker | Cada microservicio en python:3.12-slim para linux/amd64. |

## Seguridad

| Tecnología | Uso |
|---|---|
| Supabase Auth | Autenticación del frontend (acceso por invitación). Sesiones server-side con @supabase/ssr; roles en app_metadata; los no propietarios de un análisis reciben 404. |
| API Key (X-API-Key) | Autenticación de la API backend. Todas las rutas /api/v1 la requieren. El frontend actúa como proxy server-side: el navegador nunca ve la clave. |

## Lenguajes y runtime

| Tecnología | Uso |
|---|---|
| Python 3.12 | Backend API y todos los microservicios. |
| Node.js / pnpm | Runtime del frontend Next.js. |
| pip + requirements.txt | Dependencias Python por microservicio, sin monorepo manager. |
