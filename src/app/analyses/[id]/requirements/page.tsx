"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ClipboardList, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, CheckCheck, XCircle } from "lucide-react";
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
    page_number: number | null;
    filename: string | null;
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
    is_admissibility: boolean;
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}

const LIMIT = 30;

const DOMAIN_LABELS: Record<string, string> = {
    technical: "Técnico", administrative: "Administrativo", legal: "Legal",
    financial: "Económico / Financiero", hr: "Recursos Humanos", logistics: "Logístico",
    environmental: "Ambiental", quality: "Calidad", safety: "Seguridad", other: "Otro",
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
    attached_document: "Documento adjunto", sworn_statement: "Declaración jurada",
    external_certificate: "Certificado externo", inspection: "Inspección",
    sample: "Muestra", site_visit: "Visita técnica",
    auto_verifiable_from_offer: "Auto-verificable desde la oferta", other: "Otro",
};

const SCOPE_LABELS: Record<string, string> = {
    at_bid_time: "Al momento de ofertar", pre_award: "Previo a la adjudicación",
    during_execution: "Durante la ejecución", post_sale: "Postventa", other: "Otro",
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
                            <div className="text-xs text-zinc-400 mb-1">
                                {c.filename ?? "Documento desconocido"}
                                {c.page_number != null && ` — Página ${c.page_number}`}
                            </div>
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
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [verifyingAll, setVerifyingAll] = useState<boolean | null>(null);
    const [filterAdmissibility, setFilterAdmissibility] = useState<boolean | null>(null);

    const sentinelRef = useRef<HTMLDivElement>(null);
    const isFetchingRef = useRef(false);
    const offsetRef = useRef(0);
    const hasMoreRef = useRef(true);
    const filterRef = useRef<boolean | null>(null);

    const buildUrl = useCallback((off: number, admissibility: boolean | null) => {
        let url = `/api/analyses/${id}/requirements?limit=${LIMIT}&offset=${off}`;
        if (admissibility !== null) url += `&is_admissibility=${admissibility}`;
        return url;
    }, [id]);

    const fetchPage = useCallback(async (off: number, admissibility: boolean | null, append: boolean) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        if (append) setIsFetchingMore(true);
        else setIsLoading(true);
        try {
            const response = await fetch(buildUrl(off, admissibility));
            if (!response.ok) throw new Error("Error al cargar los requerimientos");
            const data: AnalysisRequirementRead[] = await response.json();
            const items = Array.isArray(data) ? data : [];
            setRequirements(prev => append ? [...prev, ...items] : items);
            const more = items.length === LIMIT;
            setHasMore(more);
            hasMoreRef.current = more;
            offsetRef.current = off + items.length;
        } catch (err) {
            console.error(err);
            setError("Error al cargar los datos");
        } finally {
            if (append) setIsFetchingMore(false);
            else setIsLoading(false);
            isFetchingRef.current = false;
            // If sentinel still visible after load, fetch next batch
            setTimeout(() => {
                if (hasMoreRef.current && sentinelRef.current && !isFetchingRef.current) {
                    const rect = sentinelRef.current.getBoundingClientRect();
                    if (rect.top < window.innerHeight) {
                        fetchPage(offsetRef.current, filterRef.current, true);
                    }
                }
            }, 50);
        }
    }, [buildUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAdmissibilityToggle = useCallback(async (req: AnalysisRequirementRead) => {
        const newValue = !req.is_admissibility;
        setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_admissibility: newValue } : r));
        try {
            const response = await fetch(`/api/requirements/${req.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_admissibility: newValue }),
            });
            if (!response.ok) throw new Error("Failed to update");
        } catch {
            setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_admissibility: req.is_admissibility } : r));
        }
    }, []);

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

    const handleVerifyAll = useCallback(async (isVerified: boolean) => {
        setVerifyingAll(isVerified);
        try {
            const response = await fetch(`/api/analyses/${id}/requirements/verify-all?is_verified=${isVerified}`, {
                method: "PATCH",
            });
            if (!response.ok) throw new Error("Failed to update all");
            setRequirements(prev => prev.map(r => ({ ...r, is_verified: isVerified })));
        } catch (err) {
            console.error(err);
        } finally {
            setVerifyingAll(null);
        }
    }, [id]);

    const handleFilterAdmissibility = useCallback((value: boolean | null) => {
        setFilterAdmissibility(value);
        filterRef.current = value;
        offsetRef.current = 0;
        hasMoreRef.current = true;
        setHasMore(true);
        fetchPage(0, value, false);
    }, [fetchPage]);

    // Infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMoreRef.current && !isFetchingRef.current) {
                    fetchPage(offsetRef.current, filterRef.current, true);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [fetchPage, isLoading]);

    // Initial load
    useEffect(() => {
        if (id) fetchPage(0, null, false);
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (id) {
            fetch(`/api/analyses/${id}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => { if (data) setAnalysis(data); })
                .catch(console.error);
        }
    }, [id]);

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

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-xs font-medium text-zinc-500 mr-1">Filtros:</span>
                <button
                    onClick={() => handleFilterAdmissibility(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterAdmissibility === null ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"}`}
                >
                    Todos
                </button>
                <button
                    onClick={() => handleFilterAdmissibility(true)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterAdmissibility === true ? "bg-violet-600 text-white border-violet-600" : "bg-white text-violet-700 border-violet-200 hover:bg-violet-50"}`}
                >
                    Admisibilidad
                </button>
                <button
                    onClick={() => handleFilterAdmissibility(false)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterAdmissibility === false ? "bg-zinc-700 text-white border-zinc-700" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"}`}
                >
                    No admisibilidad
                </button>
            </div>

            {/* Verify-all actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleVerifyAll(true)}
                    disabled={verifyingAll !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <CheckCheck className="w-4 h-4" />
                    {verifyingAll === true ? "Verificando..." : "Marcar todos como confirmados"}
                </button>
                <button
                    onClick={() => handleVerifyAll(false)}
                    disabled={verifyingAll !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <XCircle className="w-4 h-4" />
                    {verifyingAll === false ? "Desmarcando..." : "Desmarcar todos"}
                </button>
            </div>

            {isLoading ? (
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
                        requirements.map((req) => {
                            const weightVisible = req.weight && req.weight.type !== "none";
                            return (
                                <div
                                    key={req.id}
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
                                                Rol: {ROLE_LABELS[role] ?? role}
                                            </span>
                                        ))}
                                        {req.domain && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                Dominio: {DOMAIN_LABELS[req.domain] ?? req.domain}
                                            </span>
                                        )}
                                        {req.temporal_scope && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                                Alcance: {SCOPE_LABELS[req.temporal_scope] ?? req.temporal_scope}
                                            </span>
                                        )}
                                    </div>

                                    {/* Tag row 2: verification_method + confidence */}
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        {req.verification_method && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                                Verificación: {VERIFICATION_LABELS[req.verification_method] ?? req.verification_method}
                                            </span>
                                        )}
                                        {req.confidence && (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CONFIDENCE_COLORS[req.confidence] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                                                Confianza: {CONFIDENCE_LABELS[req.confidence] ?? req.confidence}
                                            </span>
                                        )}
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${req.is_admissibility ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-zinc-50 text-zinc-500 border-zinc-200"}`}>
                                            {req.is_admissibility ? "Admisibilidad" : "No admisibilidad"}
                                        </span>
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
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-50">
                                        <div className="flex-1">
                                            {req.notes && (
                                                <p className="text-xs text-zinc-400 italic">{req.notes}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleAdmissibilityToggle(req)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                    req.is_admissibility
                                                        ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                                                        : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
                                                }`}
                                            >
                                                {req.is_admissibility ? "Quitar admisibilidad" : "Marcar admisibilidad"}
                                            </button>
                                            <button
                                                onClick={() => handleVerifyToggle(req)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                    req.is_verified
                                                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                                        : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
                                                }`}
                                            >
                                                <CheckCircle2 className={`w-3.5 h-3.5 ${req.is_verified ? "text-green-600" : "text-zinc-400"}`} />
                                                {req.is_verified ? "Confirmado" : "Confirmar requerimiento"}
                                            </button>
                                        </div>
                                    </div>
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

                    {/* Sentinel for infinite scroll */}
                    <div ref={sentinelRef} className="py-2">
                        {isFetchingMore && (
                            <div className="space-y-4">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-3">
                                        <div className="flex gap-4">
                                            <Skeleton className="h-6 w-24 rounded" />
                                            <Skeleton className="h-6 flex-1 rounded" />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <Skeleton className="h-5 w-28 rounded-full" />
                                            <Skeleton className="h-5 w-20 rounded-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!hasMore && requirements.length > 0 && (
                            <p className="text-center text-xs text-zinc-400 py-4">
                                {requirements.length} requerimientos cargados
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
