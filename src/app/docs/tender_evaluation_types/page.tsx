"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Calculator,
    Percent,
    Scale,
    FileText,
    HelpCircle,
    CheckCircle2,
    XCircle,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TenderEvaluationType {
    id: number;
    label: string;
    title: string;
    description: string;
    example: string;
    icon: string;
    color_badge: string;
    background_color: string;
    extraction_complexity: "low" | "medium" | "high";
    requires_additional_document: boolean;
    typical_factors: string[];
    frequent_organizations: string[];
    observed_frequency: number;
    main_formula: string | null;
    key_signals: string[];
    notes: string[];
}

const ICON_MAP: Record<string, React.ReactNode> = {
    calculator: <Calculator className="w-5 h-5" />,
    percent: <Percent className="w-5 h-5" />,
    scale: <Scale className="w-5 h-5" />,
    "file-text": <FileText className="w-5 h-5" />,
};

function getIcon(name: string) {
    return ICON_MAP[name] ?? <HelpCircle className="w-5 h-5" />;
}

const COMPLEXITY_LABELS: Record<string, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
};

const COMPLEXITY_COLORS: Record<string, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-amber-100 text-amber-800",
    high: "bg-red-100 text-red-800",
};

function EvaluationTypeCard({ type }: { type: TenderEvaluationType }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={`rounded-xl border border-zinc-200 shadow-sm overflow-hidden ${type.background_color || "bg-white"}`}>
            <div className="bg-white p-5 border-b border-zinc-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${type.color_badge || "bg-zinc-100 text-zinc-700"}`}>
                            {getIcon(type.icon)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-semibold text-zinc-900">{type.title}</h2>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${type.color_badge || "bg-zinc-100 text-zinc-600"}`}>
                                    {type.label}
                                </span>
                            </div>
                            <p className="text-sm text-zinc-500 mt-0.5">{type.description}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COMPLEXITY_COLORS[type.extraction_complexity] || "bg-zinc-100 text-zinc-700"}`}>
                            Complejidad: {COMPLEXITY_LABELS[type.extraction_complexity] ?? type.extraction_complexity}
                        </span>
                        <span className="text-xs text-zinc-400">{type.observed_frequency} observaciones</span>
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                    {type.requires_additional_document ? (
                        <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                        <XCircle className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                    {type.requires_additional_document
                        ? "Requiere documentos adicionales al pliego"
                        : "No requiere documentos adicionales"}
                </div>

                {type.main_formula && (
                    <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Fórmula principal</p>
                        <code className="block bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 font-mono">
                            {type.main_formula}
                        </code>
                    </div>
                )}

                {type.typical_factors.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Factores típicos</p>
                        <div className="flex flex-wrap gap-1.5">
                            {type.typical_factors.map((f) => (
                                <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                            ))}
                        </div>
                    </div>
                )}

                {type.frequent_organizations.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Organismos frecuentes</p>
                        <div className="flex flex-wrap gap-1.5">
                            {type.frequent_organizations.map((o) => (
                                <Badge key={o} variant="outline" className="text-xs">{o}</Badge>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded ? "Ocultar detalles" : "Ver más detalles"}
                </button>

                {expanded && (
                    <div className="space-y-4 pt-1 border-t border-zinc-100">
                        {type.key_signals.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Señales clave</p>
                                <ul className="space-y-1">
                                    {type.key_signals.map((s, i) => (
                                        <li key={i} className="text-sm text-zinc-700 font-mono bg-zinc-50 border border-zinc-100 rounded px-2 py-1">
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {type.example && (
                            <div>
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Ejemplo real</p>
                                <blockquote className="text-sm text-zinc-600 italic border-l-2 border-zinc-300 pl-3">
                                    {type.example}
                                </blockquote>
                            </div>
                        )}

                        {type.notes.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Notas</p>
                                <ul className="space-y-1 list-disc list-inside">
                                    {type.notes.map((n, i) => (
                                        <li key={i} className="text-sm text-zinc-600">{n}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TenderEvaluationTypesPage() {
    const [types, setTypes] = useState<TenderEvaluationType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/tender-evaluation-types")
            .then((res) => {
                if (!res.ok) throw new Error(`Error ${res.status}`);
                return res.json();
            })
            .then((data) => {
                setTypes(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

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
                <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                    Tipos de Evaluación
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Catálogo de sistemas de evaluación de licitaciones detectados por el clasificador.
                </p>
            </div>

            {loading && (
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-40 bg-zinc-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Error al cargar los tipos de evaluación: {error}
                </div>
            )}

            {!loading && !error && types.length === 0 && (
                <div className="text-center py-12 text-zinc-400 text-sm">
                    No se encontraron tipos de evaluación.
                </div>
            )}

            {!loading && !error && types.length > 0 && (
                <div className="space-y-4">
                    {types.map((type) => (
                        <EvaluationTypeCard key={type.id} type={type} />
                    ))}
                </div>
            )}
        </div>
    );
}
