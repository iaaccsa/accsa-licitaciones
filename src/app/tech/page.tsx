import { Monitor, Server, Brain, Database, Cloud, ShieldCheck, Code2 } from "lucide-react";

const sections = [
    {
        icon: Monitor,
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-100",
        title: "Frontend",
        subtitle: "accsa-licitaciones-ui",
        rows: [
            { tech: "Next.js 16", use: "Framework principal con App Router. Routing basado en sistema de archivos, API Routes como proxy autenticado hacia el backend, Server Components y Client Components." },
            { tech: "React 19", use: "Librería de UI. Gestión de estado local con useState/useEffect y renderizado de componentes." },
            { tech: "TypeScript 5", use: "Tipado estático en todo el proyecto para mayor seguridad y autocompletado." },
            { tech: "Tailwind CSS 4", use: "Utilidades CSS para todo el diseño visual. Paleta base zinc. Configurado con @import en globals.css." },
            { tech: "@tailwindcss/typography", use: "Plugin que activa las clases prose para renderizar respuestas del chat en Markdown con tipografía legible." },
            { tech: "shadcn/ui + Radix UI", use: "Componentes accesibles sin estilos propios (Button, Badge, Card, Separator, Skeleton). Primitiva react-slot para composición." },
            { tech: "class-variance-authority + clsx + tailwind-merge", use: "Utilidades para definir variantes de componentes de forma tipada y combinar clases Tailwind sin conflictos." },
            { tech: "Recharts 3", use: "Gráficos de cumplimiento de propuestas (RadarChart / BarChart) en la vista de análisis." },
            { tech: "JSZip 3", use: "Empaqueta los PDFs cargados por el usuario en un archivo ZIP en el cliente antes de enviarlos al backend. Cargado de forma lazy." },
            { tech: "react-markdown 10", use: "Renderiza las respuestas del chat, que llegan en formato Markdown desde el backend, como HTML estilizado con clases prose." },
            { tech: "lucide-react", use: "Librería de iconos SVG como componentes React. Usada en toda la interfaz." },
            { tech: "tw-animate-css", use: "Animaciones CSS listas para usar, importadas como plugin de Tailwind." },
            { tech: "Vercel", use: "Plataforma de despliegue del frontend. Build y deploy automático en cada push a main, con soporte nativo para Next.js (Edge Network, ISR, API Routes como funciones serverless)." },
        ],
    },
    {
        icon: Server,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
        border: "border-emerald-100",
        title: "Backend API",
        subtitle: "accsa-licitaciones-api",
        rows: [
            { tech: "FastAPI (Python)", use: "Framework REST principal. Define los endpoints bajo /api/v1, manejo de errores, middleware CORS y sistema de dependencias para autenticación. Los microservicios se comunican exclusivamente con esta API para leer y escribir datos." },
            { tech: "Uvicorn", use: "Servidor ASGI que ejecuta la aplicación FastAPI en desarrollo y producción." },
            { tech: "Pydantic v2", use: "Validación y serialización de datos en schemas de request/response. También utilizado para definir el schema de respuesta estructurada del LLM (salida JSON tipada)." },
            { tech: "pydantic-settings", use: "Carga y validación de variables de entorno desde el archivo .env." },
            { tech: "python-multipart", use: "Soporte para recibir archivos via multipart/form-data (upload de ZIPs de licitación)." },
            { tech: "python-dotenv", use: "Carga el archivo .env en las variables de entorno al iniciar la aplicación." },
            { tech: "Vercel", use: "Plataforma de despliegue de la API FastAPI. Expone la aplicación ASGI como funciones serverless, con deploy automático en cada push a main." },
        ],
    },
    {
        icon: Brain,
        color: "text-violet-600",
        bg: "bg-violet-50",
        border: "border-violet-100",
        title: "Inteligencia Artificial",
        subtitle: "LLMs, embeddings y procesamiento documental",
        rows: [
            { tech: "OpenAI — text-embedding-3-small", use: "Generación de embeddings vectoriales (1536 dimensiones) para indexar chunks de documentos en Qdrant y para la búsqueda semántica en el chat RAG." },
            { tech: "Google Gemini — gemini-2.5-pro / gemini-2.0-pro-preview", use: "Modelo de lenguaje principal. Usado para extracción de requisitos, verificación de cumplimiento con salida JSON estructurada via schema Pydantic, generación de resúmenes en Markdown y respuestas conversacionales del chat en base al contexto recuperado de Qdrant." },
            { tech: "Cohere — rerank-multilingual-v3.0", use: "Reranking semántico de los resultados de búsqueda vectorial. Mejora la precisión seleccionando los chunks más relevantes antes de pasarlos al LLM." },
            { tech: "LlamaParse (LlamaCloud)", use: "Conversión asíncrona de PDFs a Markdown estructurado. Preserva tablas, headers y formato del documento original para mejorar la calidad del chunking posterior." },
            { tech: "langchain-text-splitters", use: "Chunking semántico de documentos Markdown: división por headers (MarkdownHeaderTextSplitter) seguida de división recursiva (RecursiveCharacterTextSplitter)." },
        ],
    },
    {
        icon: Database,
        color: "text-orange-600",
        bg: "bg-orange-50",
        border: "border-orange-100",
        title: "Bases de Datos y Almacenamiento",
        subtitle: "Persistencia, vectores y caché",
        rows: [
            { tech: "Supabase (PostgreSQL)", use: "Base de datos principal. Almacena análisis, propuestas, archivos, requisitos, resultados de compliance, workflow steps, eventos y jobs. También provee Storage para archivos ZIP y Markdown procesados. Las URLs de storage se exponen en el frontend via NEXT_PUBLIC_SUPABASE_STORAGE_URL." },
            { tech: "Qdrant", use: "Base de datos vectorial. Almacena los chunks de texto de los documentos con sus embeddings para búsqueda por similitud semántica. Cada análisis tiene su propia colección nombrada por el slug. Vectores de 1536 dimensiones." },
            { tech: "Redis (Upstash)", use: "Almacenamiento en memoria. Persiste el historial de conversaciones del chat usando file_id como clave de sesión (chat_history:{file_id}). El LLM recibe los últimos 20 mensajes del historial." },
        ],
    },
    {
        icon: Cloud,
        color: "text-sky-600",
        bg: "bg-sky-50",
        border: "border-sky-100",
        title: "Infraestructura y Despliegue",
        subtitle: "Azure, CI/CD y orquestación",
        rows: [
            { tech: "Azure Container Apps Jobs", use: "Runtime de cada microservicio del pipeline. Contenedores efímeros disparados on-demand desde n8n. Cada etapa del procesamiento (extracción, conversión, indexado, etc.) corre como un job aislado." },
            { tech: "Azure Container Registry (ACR)", use: "Registro privado de imágenes Docker. Cada microservicio publica su imagen en accsalicitaciones.azurecr.io/services/<nombre>:latest." },
            { tech: "Azure Pipelines", use: "CI/CD. Build y push paralelo de todas las imágenes al ACR en cada push a main, usando una estrategia matrix." },
            { tech: "Azure Identity", use: "Autenticación con Azure via ClientSecretCredential (service principal) para lanzar y gestionar los Container Apps Jobs desde la API." },
            { tech: "Docker", use: "Empaquetado de cada microservicio en contenedores python:3.12-slim compilados para linux/amd64." },
            { tech: "n8n", use: "Orquestador de workflows. Recibe webhooks de Supabase al crearse un análisis y dispara secuencialmente los Container Apps Jobs via la Azure Management API." },
        ],
    },
    {
        icon: ShieldCheck,
        color: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-100",
        title: "Seguridad",
        subtitle: "Autenticación y control de acceso",
        rows: [
            { tech: "API Key — X-API-Key", use: "Mecanismo de autenticación de la API backend. Todas las rutas bajo /api/v1 requieren el header X-API-Key. El frontend actúa como proxy server-side: el navegador nunca ve la clave, que se almacena exclusivamente en variables de entorno del servidor Next.js." },
        ],
    },
    {
        icon: Code2,
        color: "text-zinc-600",
        bg: "bg-zinc-100",
        border: "border-zinc-200",
        title: "Lenguajes y Runtime",
        subtitle: "Entornos de ejecución",
        rows: [
            { tech: "Python 3.12", use: "Lenguaje principal del backend API y de todos los microservicios del pipeline de procesamiento." },
            { tech: "Node.js / npm", use: "Runtime del frontend Next.js. Gestión de dependencias con package.json." },
            { tech: "pip + requirements.txt", use: "Gestión de dependencias Python por microservicio, sin monorepo manager." },
        ],
    },
];

export default function TechPage() {
    return (
        <div className="max-w-5xl mx-auto py-12 px-4 space-y-10">
            <div>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">Stack Tecnológico</h1>
                <p className="text-sm text-zinc-500">Tecnologías utilizadas en los tres repositorios del proyecto.</p>
            </div>

            {sections.map(({ icon: Icon, color, bg, border, title, subtitle, rows }) => (
                <section key={title}>
                    <div className={`flex items-center gap-2 mb-3`}>
                        <div className={`p-1.5 rounded-lg ${bg} ${border} border`}>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-zinc-800 leading-none">{title}</h2>
                            <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200">
                                    <th className="text-left px-4 py-2.5 font-medium text-zinc-500 text-xs uppercase tracking-wider w-64">Tecnología</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-zinc-500 text-xs uppercase tracking-wider">Uso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={i} className={`border-b border-zinc-100 last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}`}>
                                        <td className="px-4 py-3 font-medium text-zinc-700 align-top whitespace-nowrap">{row.tech}</td>
                                        <td className="px-4 py-3 text-zinc-500 leading-relaxed">{row.use}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    );
}
