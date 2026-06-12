"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft, Scale, AlertCircle, CheckCircle, XCircle, Info,
    Calculator, Percent, FileText, HelpCircle, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface TenderClassification {
    id: string;
    analysis_id: string;
    system_type: string;
    confidence: string;
    evidence: string[];
    detected_factors: string[];
    discarded: Record<string, string>;
    sufficient_chunks: boolean;
    additional_chunks_recommendation: string | null;
    created_at: string;
    updated_at: string;
}

interface TenderEvaluationType {
    id: number;
    label: string;
    title: string;
    description: string;
    example: string;
    icon: string;
    color_badge: string;
    background_color: string;
    extraction_complexity: string;
    requires_additional_document: boolean;
    typical_factors: string[];
    frequent_organizations: string[];
    observed_frequency: number;
    main_formula: string | null;
    key_signals: string[];
    notes: string[];
}

// --- ConfidenceBadge ---

function ConfidenceBadge({ confidence }: { confidence: string }) {
    const lower = confidence.toLowerCase();
    const isHigh = lower === "high" || lower === "alta";
    const isMedium = lower === "medium" || lower === "media";

    if (isHigh) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700 border border-green-200">
                <CheckCircle className="w-4 h-4" />
                Alta
            </span>
        );
    }
    if (isMedium) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <AlertCircle className="w-4 h-4" />
                Media
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 border border-red-200">
            <XCircle className="w-4 h-4" />
            Baja
        </span>
    );
}

// --- EvaluationTypeCard (same as admin/tender_evaluation_types) ---

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

// --- Page ---

export default function EvaluationSystemPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [classification, setClassification] = useState<TenderClassification | null>(null);
    const [evaluationType, setEvaluationType] = useState<TenderEvaluationType | null>(null);
    const [analysis, setAnalysis] = useState<{ slug: string; user_assigned_name?: string; generated_name?: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [classRes, analysisRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/tender-classification`),
                    fetch(`/api/analyses/${id}`),
                ]);

                if (classRes.status === 404) {
                    setNotFound(true);
                } else if (!classRes.ok) {
                    throw new Error("Error al cargar la clasificación");
                } else {
                    const data: TenderClassification = await classRes.json();
                    setClassification(data);

                    // Fetch evaluation type details by system_type label
                    const typeRes = await fetch(
                        `/api/tender-evaluation-types/by-label/${encodeURIComponent(data.system_type)}`
                    );
                    if (typeRes.ok) {
                        setEvaluationType(await typeRes.json());
                    }
                }

                if (analysisRes.ok) {
                    setAnalysis(await analysisRes.json());
                }
            } catch (err) {
                console.error(err);
                setError("No se pudo cargar la información del sistema de evaluación.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const analysisLabel = analysis
        ? (analysis.user_assigned_name || analysis.generated_name || analysis.slug)
        : null;

    if (error) {
        return (
            <div className="max-w-5xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
                <p className="text-zinc-600">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline">
                    Volver al análisis
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <Scale className="w-6 h-6 text-purple-600" />
                        Sistema de Evaluación
                    </h1>
                </div>
                {analysisLabel && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysisLabel}
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                </div>
            ) : notFound ? (
                <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                    <div className="bg-zinc-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Scale className="w-6 h-6 text-zinc-400" />
                    </div>
                    <p className="text-zinc-500 font-medium">Clasificación no disponible</p>
                    <p className="text-zinc-400 text-sm mt-1">
                        El sistema de evaluación aún no ha sido clasificado para este análisis.
                    </p>
                </div>
            ) : classification ? (
                <div className="space-y-6">
                    {/* Summary Card */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                                    Tipo de sistema detectado
                                </p>
                                <p className="text-2xl font-bold text-zinc-900">{classification.system_type}</p>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                    Confianza
                                </p>
                                <ConfidenceBadge confidence={classification.confidence} />
                            </div>
                        </div>

                        {!classification.sufficient_chunks && (
                            <div className="mt-4 flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-amber-800">
                                        Información insuficiente
                                    </p>
                                    {classification.additional_chunks_recommendation && (
                                        <p className="text-sm text-amber-700 mt-0.5">
                                            {classification.additional_chunks_recommendation}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Detected Factors */}
                    {classification.detected_factors.length > 0 && (
                        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                            <h2 className="text-base font-semibold text-zinc-800 mb-4">
                                Factores detectados
                            </h2>
                            <ul className="space-y-2">
                                {classification.detected_factors.map((factor, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                                        <CheckCircle className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                                        {factor}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Evidence */}
                    {classification.evidence.length > 0 && (
                        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                            <h2 className="text-base font-semibold text-zinc-800 mb-4">
                                Evidencia
                            </h2>
                            <ul className="space-y-3">
                                {classification.evidence.map((item, i) => (
                                    <li
                                        key={i}
                                        className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-lg p-3 leading-relaxed"
                                    >
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Discarded */}
                    {Object.keys(classification.discarded).length > 0 && (
                        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                            <h2 className="text-base font-semibold text-zinc-800 mb-4">
                                Tipos descartados
                            </h2>
                            <ul className="space-y-3">
                                {Object.entries(classification.discarded).map(([type, reason]) => (
                                    <li key={type} className="flex flex-col sm:flex-row sm:items-start gap-2 text-sm">
                                        <span className="shrink-0 font-mono font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                            {type}
                                        </span>
                                        <span className="text-zinc-600">{reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Evaluation Type Details */}
                    {evaluationType && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                                Detalles del tipo de evaluación
                            </p>
                            <EvaluationTypeCard type={evaluationType} />
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
