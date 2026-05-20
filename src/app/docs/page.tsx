import Link from "next/link";
import { BookOpen, Layers, Scale, GitBranch, ScanText, BrainCircuit } from "lucide-react";

const docs = [
    {
        href: "/docs/requirements_edges",
        icon: Layers,
        title: "Ejes de clasificación de requisitos",
        description: "Esquema multi-eje para describir requisitos extraídos de pliegos de licitación.",
    },
    {
        href: "/docs/tender_evaluation_types",
        icon: Scale,
        title: "Tipos de Evaluación",
        description: "Catálogo de sistemas de evaluación de licitaciones detectados por el clasificador.",
    },
    {
        href: "/docs/pipeline",
        icon: GitBranch,
        title: "Pipeline de evaluación",
        description: "Estado actual y etapas propuestas del pipeline de punta a punta, desde ingesta hasta acta de adjudicación.",
    },
    {
        href: "/docs/ocr-apis",
        icon: ScanText,
        title: "Modelos OCR para conversión PDF a Markdown",
        description: "Análisis comparativo de los principales modelos multimodales disponibles via REST API para conversión de documentos PDF a Markdown.",
    },
    {
        href: "/docs/llm-models",
        icon: BrainCircuit,
        title: "Modelos LLM por servicio",
        description: "Asignación de modelos primarios y fallback según complejidad de la tarea para cada servicio del pipeline.",
    },
];

export default function DocsPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            <div className="mb-8 flex items-center gap-3">
                <BookOpen className="w-7 h-7 text-zinc-400 shrink-0" />
                <h1 className="text-2xl font-bold text-zinc-900">Documentación</h1>
            </div>

            <div className="grid gap-4">
                {docs.map(({ href, icon: Icon, title, description }) => (
                    <Link
                        key={href}
                        href={href}
                        className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-400 hover:shadow-md transition-all"
                    >
                        <Icon className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold text-zinc-900 text-sm">{title}</p>
                            <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
