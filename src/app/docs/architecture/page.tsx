import Link from "next/link";
import { ArrowLeft, Network } from "lucide-react";

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <h2 id={id} className="text-lg font-semibold text-zinc-800 mb-4 mt-8 first:mt-0 scroll-mt-20">
            {children}
        </h2>
    );
}

function BlockTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 mt-6">
            {children}
        </h3>
    );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
    return (
        <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
            {children}
        </pre>
    );
}

const PIPELINE_STAGES = [
    {
        block: "Bloque A — Ingesta y preparacion documental",
        stages: [
            { n: 1, code: "service-file-extractor", desc: "Desempaqueta archivos del pliego y propuestas a almacenamiento." },
            { n: 2, code: "service-files-converter-mistral", desc: "Convierte PDFs/DOCX/imagenes a markdown via Mistral OCR." },
            { n: 3, code: "service-qdrant-by-file", desc: "Indexa cada archivo en Qdrant (colecciones FILE_*). Fan-out por archivo." },
            { n: 4, code: "service-file-metadata-extractor", desc: "Extrae metadatos estructurados de cada archivo. Fan-out por archivo." },
            { n: 5, code: "service-digital-sig-extractor", desc: "Parsea firmas digitales PAdES/CAdES. Fan-out por archivo." },
        ],
    },
    {
        block: "Bloque B — Clasificacion y agrupacion",
        stages: [
            { n: 6, code: "service-documents-classifier", desc: "Clasifica cada archivo segun su rol (pliego, propuesta, normativa, etc.)." },
            { n: 7, code: "service-documents-grouper", desc: "Agrupa archivos en conjuntos logicos. Gate HITL para revision humana." },
        ],
    },
    {
        block: "Bloque C — Analisis del pliego",
        stages: [
            { n: 8, code: "service-tender-classifier", desc: "Detecta el perfil de evaluacion (puntos, porcentajes, solo precio, etc.)." },
            { n: 9, code: "service-requirement-extractor", desc: "Extrae requisitos atomicos y los clasifica por rol, dominio y peso. Gate HITL." },
        ],
    },
    {
        block: "Bloque D — Evaluacion de propuestas",
        stages: [
            { n: 10, code: "service-build-proposal-index", desc: "Copia chunks de cada propuesta a colecciones PROPOSAL_* en Qdrant." },
            { n: 11, code: "service-compliance-matcher", desc: "Evalua cada requisito contra cada propuesta via RAG + LLM. Fan-out por propuesta." },
            { n: 12, code: "service-admissibility-gate", desc: "Aplica reglas de admisibilidad formal y emite veredicto por propuesta." },
            { n: 13, code: "service-compliance-summarizer", desc: "Genera resumen narrativo y metricas agregadas por propuesta." },
        ],
    },
];

const INFRA = [
    {
        name: "Supabase",
        sub: "PostgreSQL + Storage",
        color: "bg-emerald-50 border-emerald-200 text-emerald-800",
        dot: "bg-emerald-400",
        desc: "Almacen canonico de datos. Tablas: analyses, files, proposals, requirements, compliance_results, workflow_steps, admissibility_requirements, admissibility_results.",
    },
    {
        name: "Qdrant",
        sub: "Vector DB · AWS sa-east-1",
        color: "bg-blue-50 border-blue-200 text-blue-800",
        dot: "bg-blue-400",
        desc: "Busqueda semantica. Colecciones FILE_{slug}_{file_id} (por archivo) y PROPOSAL_{slug}_{proposal_id} (por propuesta). Vectores de 1536 dimensiones con text-embedding-3-small.",
    },
    {
        name: "Azure Container Apps",
        sub: "env-licitaciones · eastus",
        color: "bg-sky-50 border-sky-200 text-sky-800",
        dot: "bg-sky-400",
        desc: "Ejecucion de microservicios como jobs efimeros. Imagenes en ACR: accsalicitaciones.azurecr.io.",
    },
    {
        name: "LLM providers",
        sub: "OpenAI · Gemini · Mistral",
        color: "bg-violet-50 border-violet-200 text-violet-800",
        dot: "bg-violet-400",
        desc: "OpenAI: embeddings (text-embedding-3-small) y razonamiento (GPT-4). Google Gemini: clasificacion de documentos. Mistral: OCR para conversion de PDFs.",
    },
];

export default function ArchitecturePage() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
            </div>

            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Network className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                        Arquitectura del sistema
                    </h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Vision general de los tres proyectos, el pipeline de procesamiento de licitaciones,
                    la infraestructura compartida y el flujo de datos de punta a punta.
                </p>
            </div>

            {/* ===== LOS TRES PROYECTOS ===== */}
            <SectionTitle id="proyectos">Los tres proyectos</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    {
                        label: "UI",
                        repo: "accsa-licitaciones-ui",
                        stack: "Next.js 16 · React 19 · TypeScript · Tailwind · shadcn/ui",
                        desc: "Dashboard en el navegador. Sube ZIPs, muestra estado del workflow, requisitos, propuestas y matriz de cumplimiento. Todas las llamadas a la API se hacen server-side.",
                    },
                    {
                        label: "API",
                        repo: "accsa-licitaciones-api",
                        stack: "FastAPI · Python · Supabase · Qdrant · Azure",
                        desc: "Orquestador central. Recibe uploads, gestiona el pipeline via jobs, sirve datos a la UI y expone endpoints REST.",
                    },
                    {
                        label: "Services",
                        repo: "accsa-licitaciones-services",
                        stack: "Python 3.12 · Docker · Azure Container Apps Jobs",
                        desc: "13 microservicios que corren como jobs efimeros. Cada uno ejecuta una etapa del pipeline y escribe resultados a Supabase y Qdrant.",
                    },
                ].map(({ label, repo, stack, desc }) => (
                    <div key={repo} className="rounded-xl border border-zinc-200 bg-white shadow-sm p-4 flex flex-col gap-2">
                        <div>
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
                            <p className="font-semibold text-zinc-900 text-sm mt-0.5">{repo}</p>
                        </div>
                        <p className="text-xs text-zinc-400 font-mono leading-relaxed">{stack}</p>
                        <p className="text-xs text-zinc-600 leading-relaxed">{desc}</p>
                    </div>
                ))}
            </div>

            {/* ===== PIPELINE ===== */}
            <SectionTitle id="pipeline">Pipeline de procesamiento</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">
                13 servicios encadenados en un DAG que transforma documentos crudos en una matriz de cumplimiento evaluada.
                Los gates <code className="font-mono text-xs bg-zinc-100 px-1 rounded">HITL</code> pausan para revision humana.
            </p>

            {PIPELINE_STAGES.map(({ block, stages }) => (
                <div key={block}>
                    <BlockTitle>{block}</BlockTitle>
                    <div className="space-y-2 mb-2">
                        {stages.map(({ n, code, desc }) => (
                            <div key={code} className="flex gap-3 items-start p-3 rounded-lg border border-zinc-200 bg-white">
                                <div className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                    {n}
                                </div>
                                <div>
                                    <code className="text-xs font-mono font-semibold text-zinc-800 bg-zinc-100 px-1.5 py-0.5 rounded">
                                        {code}
                                    </code>
                                    <p className="text-sm text-zinc-600 mt-0.5">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* ===== INFRAESTRUCTURA ===== */}
            <SectionTitle id="infra">Infraestructura compartida</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
                {INFRA.map(({ name, sub, color, dot, desc }) => (
                    <div key={name} className={`rounded-xl border p-4 ${color}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <span className="font-semibold text-sm">{name}</span>
                        </div>
                        <p className="text-xs opacity-70 font-mono mb-2">{sub}</p>
                        <p className="text-xs leading-relaxed opacity-80">{desc}</p>
                    </div>
                ))}
            </div>

            {/* ===== FLUJO DE DATOS ===== */}
            <SectionTitle id="flujo">Flujo de datos</SectionTitle>
            <p className="text-sm text-zinc-500 mb-3">
                Recorrido completo desde que el usuario sube un ZIP hasta que la UI muestra los resultados.
            </p>
            <CodeBlock>
{`UI (sube ZIP)
  → API (guarda en Supabase, inicializa workflow_steps)
    → pipeline via Azure Container Apps Jobs:
        file-extractor → converter-mistral
          → qdrant-by-file  (fan-out por archivo → colecciones FILE_*)
              ├─ file-metadata-extractor
              └─ digital-sig-extractor
                  → documents-classifier
                    → documents-grouper  [HITL]
                      ├─ tender-classifier → requirement-extractor  [HITL]
                      └─ build-proposal-index  (fan-out → colecciones PROPOSAL_*)
                            ↓ (join: requirement-extractor + build-proposal-index)
                          compliance-matcher  (fan-out por propuesta)  [HITL]
                            → admissibility-gate
                              → compliance-summarizer
  ← callback API → UI muestra resultados`}
            </CodeBlock>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 leading-relaxed">
                Cada servicio lee su input de Supabase y Qdrant, escribe resultados, y hace{" "}
                <code className="font-mono bg-zinc-100 px-1 rounded">POST /jobs/callback</code> a la API para disparar el siguiente paso.
                La UI no contacta directamente a los servicios ni a Supabase; todo va via API proxy.
            </div>
        </div>
    );
}
