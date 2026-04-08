import Link from "next/link";
import { BookOpen, Layers, Scale } from "lucide-react";

const docs = [
    {
        href: "/docs/requirements_edges",
        icon: Layers,
        title: "Ejes de clasificación de requerimientos",
        description: "Esquema multi-eje para describir requerimientos extraídos de pliegos de licitación.",
    },
    {
        href: "/docs/tender_evaluation_types",
        icon: Scale,
        title: "Tipos de Evaluación",
        description: "Catálogo de sistemas de evaluación de licitaciones detectados por el clasificador.",
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
