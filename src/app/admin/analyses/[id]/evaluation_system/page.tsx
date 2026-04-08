"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft, Scale, AlertCircle, CheckCircle, XCircle, Info,
    Calculator, Percent, FileText, HelpCircle, CheckCircle2, ChevronDown, ChevronUp,
    TrendingDown, ShieldCheck, Eye, BookOpen,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// --- Types ---

interface Factor {
    id: string;
    label: string;
    weight_type: "points" | "percent" | "formula" | "none";
    weight_value: number | null;
    formula: string | null;
    block: "cualitativo" | "cuantitativo" | null;
    is_negative: boolean;
    citations: string[];
}

interface RoleSignal {
    detected: boolean;
    evidence: string[];
}

interface EnabledRole {
    enabled: boolean;
    source: string;
    evidence: string[];
}

interface Discarded {
    discarded_types: string[];
    reason: string;
}

interface TenderClassification {
    id: string;
    analysis_id: string;
    system_type: string;
    confidence: string;
    evidence: string[];
    detected_factors: string[];
    discarded: Discarded | null;
    sufficient_chunks: boolean;
    additional_chunks_recommendation: string | null;
    created_at: string;
    updated_at: string;
    profile_warnings: string[];
    factors: Factor[];
    role_signals: Record<string, RoleSignal> | null;
    enabled_roles: Record<string, EnabledRole>;
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

// --- Constants ---

const ROLE_LABELS: Record<string, string> = {
    admisibilidad_obligatoria: "Admisibilidad obligatoria",
    admisibilidad_subsanable: "Admisibilidad subsanable",
    puntuable: "Puntuable",
    penalizador: "Penalizador",
    informativo: "Informativo",
    preferencia_legal: "Preferencia legal",
    desconocido_pendiente_pliego_general: "Pendiente (pliego general)",
};

const SOURCE_LABELS: Record<string, string> = {
    both: "Estrategia + evidencia textual",
    strategy_default: "Por defecto de estrategia",
    strategy_required: "Requerido por estrategia",
    strategy: "Solo por estrategia",
    text_only_rejected: "Detectado pero no aplicable",
    none: "Sin fuente",
};

const SOURCE_COLORS: Record<string, string> = {
    both: "bg-green-100 text-green-800 border-green-200",
    strategy_default: "bg-blue-100 text-blue-800 border-blue-200",
    strategy_required: "bg-indigo-100 text-indigo-800 border-indigo-200",
    strategy: "bg-sky-100 text-sky-800 border-sky-200",
    text_only_rejected: "bg-amber-100 text-amber-800 border-amber-200",
    none: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const WEIGHT_TYPE_LABELS: Record<string, string> = {
    points: "Puntos",
    percent: "Porcentaje",
    formula: "Fórmula",
    none: "Sin peso",
};

// --- Shared sub-components ---

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

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-zinc-100 bg-zinc-50">
                <span className="text-zinc-500">{icon}</span>
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">{title}</h2>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function CitationsExpand({ citations }: { citations: string[] }) {
    const [open, setOpen] = useState(false);
    if (citations.length === 0) return null;
    return (
        <div className="mt-2">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {open ? "Ocultar citas" : `Ver ${citations.length} cita${citations.length > 1 ? "s" : ""} del pliego`}
            </button>
            {open && (
                <ul className="mt-2 space-y-1">
                    {citations.map((c, i) => (
                        <li key={i} className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-100 rounded px-2 py-1.5 leading-relaxed italic">
                            &ldquo;{c}&rdquo;
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// --- v2 sections ---

function FactorsSection({ factors }: { factors: Factor[] }) {
    const hasBlocks = factors.some((f) => f.block !== null);
    const groups: Record<string, Factor[]> = hasBlocks
        ? factors.reduce((acc, f) => {
            const key = f.block ?? "sin_bloque";
            acc[key] = [...(acc[key] ?? []), f];
            return acc;
        }, {} as Record<string, Factor[]>)
        : { all: factors };

    const blockLabel: Record<string, string> = {
        cualitativo: "Bloque cualitativo",
        cuantitativo: "Bloque cuantitativo",
        sin_bloque: "Sin bloque",
        all: "",
    };

    return (
        <SectionCard title="Factores de evaluación" icon={<Calculator className="w-4 h-4" />}>
            <div className="space-y-6">
                {Object.entries(groups).map(([block, groupFactors]) => (
                    <div key={block}>
                        {hasBlocks && (
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                {blockLabel[block] ?? block}
                            </p>
                        )}
                        <div className="space-y-3">
                            {groupFactors.map((factor) => (
                                <div
                                    key={factor.id}
                                    className={`rounded-lg border p-4 ${factor.is_negative ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                        <div className="flex items-start gap-2">
                                            {factor.is_negative ? (
                                                <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                            )}
                                            <div>
                                                <p className={`text-sm font-semibold ${factor.is_negative ? "text-red-800" : "text-zinc-800"}`}>
                                                    {factor.label}
                                                </p>
                                                <p className="text-xs text-zinc-400 font-mono mt-0.5">{factor.id}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs font-medium text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-full">
                                                {WEIGHT_TYPE_LABELS[factor.weight_type] ?? factor.weight_type}
                                            </span>
                                            {factor.weight_value !== null && (
                                                <span className={`text-sm font-bold ${factor.is_negative ? "text-red-700" : "text-zinc-800"}`}>
                                                    {factor.is_negative ? "−" : ""}{factor.weight_value}
                                                    {factor.weight_type === "percent" ? "%" : factor.weight_type === "points" ? " pts" : ""}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {factor.formula && (
                                        <div className="mt-3">
                                            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Fórmula</p>
                                            <code className="block bg-white border border-zinc-200 rounded px-2 py-1.5 text-xs font-mono text-zinc-700">
                                                {factor.formula}
                                            </code>
                                        </div>
                                    )}
                                    <CitationsExpand citations={factor.citations} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

function EnabledRolesSection({ enabledRoles }: { enabledRoles: Record<string, EnabledRole> }) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const entries = Object.entries(enabledRoles);
    if (entries.length === 0) return null;

    return (
        <SectionCard title="Roles habilitados" icon={<ShieldCheck className="w-4 h-4" />}>
            <div className="space-y-2">
                {entries.map(([role, info]) => {
                    const label = ROLE_LABELS[role] ?? role;
                    const sourceLabel = SOURCE_LABELS[info.source] ?? info.source;
                    const sourceColor = SOURCE_COLORS[info.source] ?? SOURCE_COLORS.none;
                    const isOpen = expanded === role;

                    return (
                        <div
                            key={role}
                            className={`rounded-lg border transition-colors ${info.enabled ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"}`}
                        >
                            <button
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                onClick={() => setExpanded(isOpen ? null : role)}
                            >
                                <div className="flex items-center gap-3">
                                    {info.enabled ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                    ) : (
                                        <XCircle className="w-4 h-4 text-zinc-300 shrink-0" />
                                    )}
                                    <span className={`text-sm font-medium ${info.enabled ? "text-zinc-800" : "text-zinc-400"}`}>
                                        {label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${sourceColor}`}>
                                        {sourceLabel}
                                    </span>
                                    {info.evidence.length > 0 && (
                                        isOpen
                                            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                                            : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                    )}
                                </div>
                            </button>
                            {isOpen && info.evidence.length > 0 && (
                                <div className="px-4 pb-3 border-t border-zinc-100 pt-3 space-y-1">
                                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Evidencia textual</p>
                                    {info.evidence.map((e, i) => (
                                        <p key={i} className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-100 rounded px-2 py-1.5 italic leading-relaxed">
                                            &ldquo;{e}&rdquo;
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}

function RoleSignalsSection({ roleSignals }: { roleSignals: Record<string, RoleSignal> }) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const entries = Object.entries(roleSignals);
    const detected = entries.filter(([, v]) => v.detected);
    const notDetected = entries.filter(([, v]) => !v.detected);
    if (entries.length === 0) return null;

    return (
        <SectionCard title="Señales detectadas por LLM" icon={<Eye className="w-4 h-4" />}>
            <p className="text-xs text-zinc-400 mb-4">
                Evidencia textual encontrada en el pliego por el clasificador. Indica qué se detectó, no qué está habilitado.
            </p>
            <div className="space-y-2">
                {detected.map(([role, signal]) => {
                    const label = ROLE_LABELS[role] ?? role;
                    const isOpen = expanded === role;
                    return (
                        <div key={role} className="rounded-lg border border-zinc-200 bg-white">
                            <button
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                onClick={() => setExpanded(isOpen ? null : role)}
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-purple-500 shrink-0" />
                                    <span className="text-sm font-medium text-zinc-800">{label}</span>
                                </div>
                                {signal.evidence.length > 0 && (
                                    isOpen
                                        ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                                        : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                )}
                            </button>
                            {isOpen && signal.evidence.length > 0 && (
                                <div className="px-4 pb-3 border-t border-zinc-100 pt-3 space-y-1">
                                    {signal.evidence.map((e, i) => (
                                        <p key={i} className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-100 rounded px-2 py-1.5 italic leading-relaxed">
                                            &ldquo;{e}&rdquo;
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {notDetected.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {notDetected.map(([role]) => (
                            <span key={role} className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-full">
                                {ROLE_LABELS[role] ?? role}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </SectionCard>
    );
}

// --- EvaluationTypeCard ---

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

export default function AdminEvaluationSystemPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [classification, setClassification] = useState<TenderClassification | null>(null);
    const [evaluationType, setEvaluationType] = useState<TenderEvaluationType | null>(null);
    const [analysis, setAnalysis] = useState<{ slug: string; user_name?: string; generated_name?: string } | null>(null);
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
        ? (analysis.user_name || analysis.generated_name || analysis.slug)
        : null;

    if (error) {
        return (
            <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
                <PageHeader onBack={() => router.back()} analysisLabel={null} />
                <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                    <Scale className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500 font-medium">Sistema de evaluación no disponible</p>
                    <p className="text-zinc-400 text-sm mt-1">No se pudo cargar la información.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <PageHeader onBack={() => router.back()} analysisLabel={analysisLabel} />

            {isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-56 rounded-xl" />
                    <Skeleton className="h-56 rounded-xl" />
                    <Skeleton className="h-56 rounded-xl" />
                </div>
            ) : notFound ? (
                <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                    <Scale className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500 font-medium">Clasificación no disponible</p>
                    <p className="text-zinc-400 text-sm mt-1">
                        El sistema de evaluación aún no ha sido clasificado para este análisis.
                    </p>
                </div>
            ) : classification ? (
                <div className="space-y-6">
                    {/* Profile warnings */}
                    {classification.profile_warnings?.length > 0 && (
                        <div className="space-y-2">
                            {classification.profile_warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                    <p className="text-sm text-amber-800">{w}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Insufficient chunks */}
                    {!classification.sufficient_chunks && (
                        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">Información insuficiente del pliego</p>
                                {classification.additional_chunks_recommendation && (
                                    <p className="text-sm text-amber-700 mt-0.5">{classification.additional_chunks_recommendation}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                                    Tipo de sistema detectado
                                </p>
                                <p className="text-2xl font-bold text-zinc-900">{classification.system_type}</p>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Confianza</p>
                                <ConfidenceBadge confidence={classification.confidence} />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 mt-4 border-t border-zinc-100 text-xs text-zinc-400">
                            <span>
                                Creado: <strong className="text-zinc-600">{new Date(classification.created_at).toLocaleString("es-ES")}</strong>
                            </span>
                            <span>
                                Actualizado: <strong className="text-zinc-600">{new Date(classification.updated_at).toLocaleString("es-ES")}</strong>
                            </span>
                            <span className="font-mono text-zinc-300 break-all">{classification.id}</span>
                        </div>
                    </div>

                    {/* Factors */}
                    {classification.factors?.length > 0 && (
                        <FactorsSection factors={classification.factors} />
                    )}

                    {/* Enabled roles */}
                    {classification.enabled_roles && Object.keys(classification.enabled_roles).length > 0 && (
                        <EnabledRolesSection enabledRoles={classification.enabled_roles} />
                    )}

                    {/* Role signals */}
                    {classification.role_signals && Object.keys(classification.role_signals).length > 0 && (
                        <RoleSignalsSection roleSignals={classification.role_signals} />
                    )}

                    {/* Detected factors */}
                    {classification.detected_factors?.length > 0 && (
                        <SectionCard title="Factores detectados (texto libre)" icon={<BookOpen className="w-4 h-4" />}>
                            <div className="flex flex-wrap gap-2">
                                {classification.detected_factors.map((factor, i) => (
                                    <Badge key={i} variant="secondary">{factor}</Badge>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {/* Evidence */}
                    {classification.evidence?.length > 0 && (
                        <SectionCard title="Evidencia del pliego" icon={<FileText className="w-4 h-4" />}>
                            <ul className="space-y-2">
                                {classification.evidence.map((item, i) => (
                                    <li key={i} className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-lg p-3 leading-relaxed italic">
                                        &ldquo;{item}&rdquo;
                                    </li>
                                ))}
                            </ul>
                        </SectionCard>
                    )}

                    {/* Discarded */}
                    {classification.discarded && (
                        <SectionCard title="Tipos descartados" icon={<XCircle className="w-4 h-4" />}>
                            {classification.discarded.discarded_types?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {classification.discarded.discarded_types.map((t) => (
                                        <span key={t} className="text-xs font-mono font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {classification.discarded.reason && (
                                <p className="text-sm text-zinc-600">{classification.discarded.reason}</p>
                            )}
                        </SectionCard>
                    )}

                    {/* Evaluation Type catalog details */}
                    {evaluationType && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                                Catálogo: tipo de evaluación
                            </p>
                            <EvaluationTypeCard type={evaluationType} />
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function PageHeader({ onBack, analysisLabel }: { onBack: () => void; analysisLabel: string | null }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
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
    );
}
