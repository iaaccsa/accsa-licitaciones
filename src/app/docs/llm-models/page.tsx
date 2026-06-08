import Link from "next/link";
import { ArrowLeft, BrainCircuit } from "lucide-react";

const COMPLEXITY_STYLES = {
    Alta: "bg-red-50 text-red-700 border-red-200",
    Media: "bg-amber-50 text-amber-700 border-amber-200",
    Baja: "bg-green-50 text-green-700 border-green-200",
} as const;

const services = [
    {
        code: "service-documents-classifier",
        task: "Clasificar tipo de documento (pliego, anexo, adenda, etc.)",
        complexity: "Baja" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Clasificación con categorías fijas y contexto corto. No requiere razonamiento complejo.",
    },
    {
        code: "service-documents-grouper",
        task: "Agrupar documentos por similitud de contenido",
        complexity: "Baja" as const,
        primary: "gemini-3.1-pro-preview",
        fallback: "gpt-4.1-mini",
        reason: "Agrupación y generación de nombre de licitación. Pro por su mayor capacidad de razonamiento sobre títulos y contenido heterogéneo.",
    },
    {
        code: "service-file-metadata-extractor",
        task: "Extraer metadatos estructurados de archivos",
        complexity: "Baja" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Extracción de campos puntuales (título, fecha, organismo). Ventana de contexto reducida.",
    },
    {
        code: "service-tender-classifier",
        task: "Clasificar sistema de evaluación, factores y roles del pliego",
        complexity: "Alta" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Requiere comprensión del marco normativo uruguayo. Flash con thinking budget como primario; mini como fallback.",
    },
    {
        code: "service-requirement-extractor",
        task: "Extraer requisitos atómicos del pliego vía RAG iterativo",
        complexity: "Alta" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Alto volumen de llamadas (N batches x chunks). Flash con thinking budget; mini como fallback por el prompt estructurado con ejes definidos.",
    },
    {
        code: "service-compliance-matcher",
        task: "Evaluar cumplimiento de cada requisito por propuesta",
        complexity: "Media" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Evaluación individual por requisito con RAG. Volumen alto (1 llamada por requisito por propuesta).",
    },
    {
        code: "service-compliance-summarizer",
        task: "Generar resumen ejecutivo de cumplimiento por propuesta",
        complexity: "Media" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Una sola llamada por propuesta pero con contexto extenso (matriz completa). Mini maneja bien la síntesis.",
    },
    {
        code: "service-economic-offer-extractor",
        task: "Extraer datos económicos estructurados de ofertas",
        complexity: "Media" as const,
        primary: "gemini-2.5-flash",
        fallback: "gpt-4.1-mini",
        reason: "Extracción de tablas y montos con RAG. Precisión numérica importante pero patrón repetitivo.",
    },
];

function ModelBadge({ model }: { model: string }) {
    const isGemini = model.startsWith("gemini");
    const base = isGemini
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : "bg-violet-50 text-violet-800 border-violet-200";
    return (
        <span className={`inline-block text-xs font-mono font-medium px-2 py-0.5 rounded border ${base}`}>
            {model}
        </span>
    );
}

export default function LlmModelsPage() {
    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
            </div>

            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <BrainCircuit className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                        Modelos LLM por servicio
                    </h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Modelos asignados por servicio según complejidad de la tarea. El modelo de embeddings (
                    <code className="font-mono text-xs bg-zinc-100 px-1 rounded">text-embedding-3-small</code> de OpenAI)
                    se mantiene sin cambios en todos los servicios que lo usan.
                </p>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-3 mb-6 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                {(["Alta", "Media", "Baja"] as const).map((c) => (
                    <span key={c} className={`text-xs font-medium px-2 py-0.5 rounded-full border ${COMPLEXITY_STYLES[c]}`}>
                        {c}
                    </span>
                ))}
                <span className="text-xs text-zinc-400 self-center ml-1">| Complejidad de la tarea</span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Servicio</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Complejidad</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Primario</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Fallback</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                        {services.map((s) => (
                            <tr key={s.code} className="hover:bg-zinc-50 transition-colors group">
                                <td className="px-4 py-3 align-top">
                                    <div className="flex flex-col gap-1">
                                        <code className="text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded w-fit">
                                            {s.code}
                                        </code>
                                        <span className="text-xs text-zinc-500 leading-snug">{s.task}</span>
                                        <span className="text-xs text-zinc-400 leading-snug group-hover:text-zinc-500 transition-colors">
                                            {s.reason}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 align-top hidden md:table-cell">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${COMPLEXITY_STYLES[s.complexity]}`}>
                                        {s.complexity}
                                    </span>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <ModelBadge model={s.primary} />
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <ModelBadge model={s.fallback} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Note */}
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <strong>Nota sobre modelos:</strong> <code className="font-mono text-xs bg-blue-100 px-1 rounded">gemini-2.5-flash</code> actúa como primario en la mayoría de servicios; <code className="font-mono text-xs bg-blue-100 px-1 rounded">gemini-3.1-pro-preview</code> se usa donde se requiere mayor capacidad de razonamiento. <code className="font-mono text-xs bg-blue-100 px-1 rounded">gpt-4.1-mini</code> es el fallback universal en todos los servicios.
            </div>
        </div>
    );
}
