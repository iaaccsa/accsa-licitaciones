"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ClipboardList, AlertCircle, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Weight {
    type: string;
    value: number | null;
    formula: string | null;
    block: string | null;
}

interface MappedFactor {
    factor_id: string;
    weight_type: string;
    weight_value: number | null;
    formula: string | null;
    block: string | null;
}

interface Citation {
    chunk_id: string;
    page: string;
    snippet: string;
}

interface AnalysisRequirementRead {
    id: string;
    analysis_id: string;
    requirement_code: string;
    requirement_text: string;
    requirement_summary: string | null;
    roles: string[];
    mapped_factors: MappedFactor[];
    domain: string | null;
    weight: Weight | null;
    verification_method: string | null;
    temporal_scope: string | null;
    citations: Citation[];
    confidence: string | null;
    extraction_batch_id: number | null;
    notes: string | null;
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}

const LIMIT = 50;

const DOMAIN_LABELS: Record<string, string> = {
    tecnico: "Técnico", administrativo: "Administrativo", legal: "Legal",
    economico_financiero: "Económico-Financiero", rrhh: "RRHH", logistico: "Logístico",
    ambiental: "Ambiental", calidad: "Calidad", seguridad: "Seguridad", otro: "Otro",
};

const ROLE_LABELS: Record<string, string> = {
    admisibilidad_obligatoria: "Admisibilidad obligatoria",
    admisibilidad_subsanable: "Admisibilidad subsanable",
    puntuable: "Puntuable",
    penalizador: "Penalizador",
    informativo: "Informativo",
    preferencia_legal: "Preferencia legal",
    desconocido_pendiente_pliego_general: "Pendiente pliego general",
};

const ROLE_COLORS: Record<string, string> = {
    admisibilidad_obligatoria: "bg-red-50 text-red-700 border-red-100",
    admisibilidad_subsanable: "bg-orange-50 text-orange-700 border-orange-100",
    puntuable: "bg-blue-50 text-blue-700 border-blue-100",
    penalizador: "bg-purple-50 text-purple-700 border-purple-100",
    informativo: "bg-zinc-50 text-zinc-600 border-zinc-200",
    preferencia_legal: "bg-indigo-50 text-indigo-700 border-indigo-100",
    desconocido_pendiente_pliego_general: "bg-yellow-50 text-yellow-700 border-yellow-100",
};

const VERIFICATION_LABELS: Record<string, string> = {
    documento_adjunto: "Doc. adjunto", declaracion_jurada: "Dec. jurada",
    certificado_externo: "Cert. externo", inspeccion: "Inspección",
    muestra: "Muestra", visita_tecnica: "Visita técnica",
    auto_verificable_desde_oferta: "Auto-verificable", otro: "Otro",
};

const SCOPE_LABELS: Record<string, string> = {
    al_momento_ofertar: "Al ofertar", previo_adjudicacion: "Pre-adjudicación",
    durante_ejecucion: "Durante ejecución", postventa: "Postventa", otro: "Otro",
};

const CONFIDENCE_COLORS: Record<string, string> = {
    alta: "bg-green-50 text-green-700 border-green-100",
    media: "bg-yellow-50 text-yellow-700 border-yellow-100",
    baja: "bg-orange-50 text-orange-700 border-orange-100",
    muy_baja: "bg-red-50 text-red-700 border-red-100",
};

const CONFIDENCE_LABELS: Record<string, string> = {
    alta: "Alta", media: "Media", baja: "Baja", muy_baja: "Muy baja",
};

function CitationsToggle({ citations }: { citations: Citation[] }) {
    const [expanded, setExpanded] = useState(false);
    if (citations.length === 0) return null;
    return (
        <div className="mt-3">
            <button
                onClick={() => setExpanded(v => !v)}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
            >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? "Ocultar citas" : `Ver ${citations.length} cita${citations.length > 1 ? "s" : ""}`}
            </button>
            {expanded && (
                <div className="mt-2 space-y-2">
                    {citations.map((c, i) => (
                        <div key={i} className="bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
                            <div className="text-xs text-zinc-400 mb-1">Página {c.page}</div>
                            <p className="text-xs text-zinc-600 italic leading-relaxed">"{c.snippet}"</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function RequirementsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [requirements, setRequirements] = useState<AnalysisRequirementRead[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);

    const observer = useRef<IntersectionObserver | null>(null);
    const lastRequirementElementRef = useCallback((node: HTMLDivElement | null) => {
        if (isLoadingInitial || isLoadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setOffset(prevOffset => prevOffset + LIMIT);
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoadingInitial, isLoadingMore, hasMore]);

    const fetchRequirements = useCallback(async (currentOffset: number, isInitial: boolean) => {
        try {
            if (isInitial) setIsLoadingInitial(true);
            else setIsLoadingMore(true);

            const response = await fetch(`/api/analyses/${id}/requirements?limit=${LIMIT}&offset=${currentOffset}`);

            if (!response.ok) throw new Error("Error al cargar los requerimientos");

            const data = await response.json();
            const newRequirements = Array.isArray(data) ? data : [];

            setRequirements(prev => isInitial ? newRequirements : [...prev, ...newRequirements]);
            setHasMore(newRequirements.length === LIMIT);
        } catch (err) {
            console.error(err);
            setError("Error al cargar los datos");
        } finally {
            if (isInitial) setIsLoadingInitial(false);
            else setIsLoadingMore(false);
        }
    }, [id]);

    const handleVerifyToggle = useCallback(async (req: AnalysisRequirementRead) => {
        const newValue = !req.is_verified;
        setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_verified: newValue } : r));
        try {
            const response = await fetch(`/api/requirements/${req.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_verified: newValue }),
            });
            if (!response.ok) throw new Error("Failed to update");
        } catch {
            setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_verified: req.is_verified } : r));
        }
    }, []);

    useEffect(() => {
        if (id) {
            fetchRequirements(0, true);
            fetch(`/api/analyses/${id}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => { if (data) setAnalysis(data); })
                .catch(console.error);
        }
    }, [id, fetchRequirements]);

    useEffect(() => {
        if (offset > 0) {
            fetchRequirements(offset, false);
        }
    }, [offset, fetchRequirements]);

    if (error) {
        return (
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
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
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-green-600" />
                        Requerimientos
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {isLoadingInitial ? (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-3">
                            <div className="flex gap-4">
                                <Skeleton className="h-6 w-24 rounded" />
                                <Skeleton className="h-6 flex-1 rounded" />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Skeleton className="h-5 w-28 rounded-full" />
                                <Skeleton className="h-5 w-20 rounded-full" />
                                <Skeleton className="h-5 w-24 rounded-full" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {requirements.length > 0 ? (
                        requirements.map((req, index) => {
                            const isLastElement = requirements.length === index + 1;
                            const weightVisible = req.weight && req.weight.type !== "none";
                            return (
                                <div
                                    key={req.id}
                                    ref={isLastElement ? lastRequirementElementRef : null}
                                    className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                    {/* Header: code + text */}
                                    <div className="flex flex-col md:flex-row gap-3 md:gap-6 mb-4">
                                        <div className="min-w-[100px] pt-1">
                                            <span className="font-mono text-zinc-900 font-bold bg-zinc-100 px-2.5 py-1 rounded-md text-sm border border-zinc-200">
                                                {req.requirement_code}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-zinc-700 leading-relaxed text-sm">
                                                {req.requirement_text}
                                            </p>
                                            {req.requirement_summary && (
                                                <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                                                    {req.requirement_summary}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Tag row 1: roles + domain + temporal_scope */}
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        {req.roles.map(role => (
                                            <span
                                                key={role}
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                                            >
                                                {ROLE_LABELS[role] ?? role}
                                            </span>
                                        ))}
                                        {req.domain && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                {DOMAIN_LABELS[req.domain] ?? req.domain}
                                            </span>
                                        )}
                                        {req.temporal_scope && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                                {SCOPE_LABELS[req.temporal_scope] ?? req.temporal_scope}
                                            </span>
                                        )}
                                    </div>

                                    {/* Tag row 2: verification_method + confidence */}
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        {req.verification_method && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                                {VERIFICATION_LABELS[req.verification_method] ?? req.verification_method}
                                            </span>
                                        )}
                                        {req.confidence && (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CONFIDENCE_COLORS[req.confidence] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                                                Confianza: {CONFIDENCE_LABELS[req.confidence] ?? req.confidence}
                                            </span>
                                        )}
                                    </div>

                                    {/* Weight */}
                                    {weightVisible && (
                                        <div className="text-xs text-zinc-500 mb-2">
                                            <span className="font-medium text-zinc-600">Peso:</span>{" "}
                                            {req.weight!.type === "formula"
                                                ? `formula: ${req.weight!.formula}`
                                                : `${req.weight!.value} ${req.weight!.type}`}
                                            {req.weight!.block && ` · ${req.weight!.block}`}
                                        </div>
                                    )}

                                    {/* Mapped factors */}
                                    {req.mapped_factors.length > 0 && (
                                        <div className="text-xs text-zinc-500 mb-2 flex flex-wrap gap-2">
                                            <span className="font-medium text-zinc-600">Factores:</span>
                                            {req.mapped_factors.map((f, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded font-mono">
                                                    {f.factor_id}
                                                    {f.weight_value !== null && ` · ${f.weight_value} ${f.weight_type}`}
                                                    {f.block && ` · ${f.block}`}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Citations */}
                                    <CitationsToggle citations={req.citations} />

                                    {/* Footer: notes + is_verified */}
                                    {(req.notes || true) && (
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-50">
                                            <div className="flex-1">
                                                {req.notes && (
                                                    <p className="text-xs text-zinc-400 italic">{req.notes}</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleVerifyToggle(req)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                    req.is_verified
                                                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                                        : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
                                                }`}
                                            >
                                                <CheckCircle2 className={`w-3.5 h-3.5 ${req.is_verified ? "text-green-600" : "text-zinc-400"}`} />
                                                {req.is_verified ? "Verificado" : "Marcar verificado"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                            <div className="bg-zinc-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ClipboardList className="w-6 h-6 text-zinc-400" />
                            </div>
                            <p className="text-zinc-500 font-medium">No se encontraron requerimientos</p>
                            <p className="text-zinc-400 text-sm mt-1">Este análisis no tiene requerimientos asociados.</p>
                        </div>
                    )}
                </div>
            )}

            {isLoadingMore && (
                <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
            )}
        </div>
    );
}
