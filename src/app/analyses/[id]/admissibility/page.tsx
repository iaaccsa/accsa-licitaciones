"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ShieldCheck, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, CheckCheck, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdmissibilityRequirement, AdmissibilityRequirementCitation } from "@/lib/admissibility-types";
import { isExclusionary } from "@/lib/admissibility-types";

const LIMIT = 30;

const DOMAIN_LABELS: Record<string, string> = {
    technical: "Técnico", administrative: "Administrativo", legal: "Legal",
    financial: "Económico / Financiero", hr: "Recursos Humanos", logistics: "Logístico",
    environmental: "Ambiental", quality: "Calidad", safety: "Seguridad", other: "Otro",
};

const ROLE_LABELS: Record<string, string> = {
    admisibilidad_obligatoria: "Admisibilidad obligatoria",
    admisibilidad_subsanable: "Admisibilidad subsanable",
};

const ROLE_COLORS: Record<string, string> = {
    admisibilidad_obligatoria: "bg-red-50 text-red-700 border-red-100",
    admisibilidad_subsanable: "bg-orange-50 text-orange-700 border-orange-100",
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

function CitationsToggle({ citations }: { citations: AdmissibilityRequirementCitation[] }) {
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
                            <p className="text-xs text-zinc-600 italic leading-relaxed">&ldquo;{c.snippet}&rdquo;</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AdmissibilityRequirementsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [requirements, setRequirements] = useState<AdmissibilityRequirement[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string; user_assigned_name?: string; generated_name?: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [verifyingAll, setVerifyingAll] = useState<boolean | null>(null);

    const sentinelRef = useRef<HTMLDivElement>(null);
    const isFetchingRef = useRef(false);
    const offsetRef = useRef(0);
    const hasMoreRef = useRef(true);

    const fetchPage = useCallback(async (off: number, append: boolean) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        if (append) setIsFetchingMore(true);
        else setIsLoading(true);
        try {
            const response = await fetch(`/api/analyses/${id}/admissibility-requirements?limit=${LIMIT}&offset=${off}`);
            if (!response.ok) throw new Error("Error al cargar los requisitos de admisibilidad");
            const data: AdmissibilityRequirement[] = await response.json();
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
                        fetchPage(offsetRef.current, true);
                    }
                }
            }, 50);
        }
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleVerifyToggle = useCallback(async (req: AdmissibilityRequirement) => {
        const newValue = !req.is_verified;
        setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_verified: newValue } : r));
        try {
            const response = await fetch(`/api/admissibility-requirements/${req.id}`, {
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
            const response = await fetch(`/api/analyses/${id}/admissibility-requirements/verify-all?is_verified=${isVerified}`, {
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

    // Infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMoreRef.current && !isFetchingRef.current) {
                    fetchPage(offsetRef.current, true);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [fetchPage, isLoading]);

    // Initial load
    useEffect(() => {
        if (id) fetchPage(0, false);
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
                        <ShieldCheck className="w-6 h-6 text-violet-600" />
                        Requisitos de Admisibilidad
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.user_assigned_name || analysis.generated_name || analysis.slug}
                    </span>
                )}
            </div>

            <p className="text-sm text-zinc-500">
                Requisitos excluyentes extraídos con la pasada dedicada de admisibilidad.
            </p>

            {/* Verify-all actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleVerifyAll(true)}
                    disabled={verifyingAll !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <CheckCheck className="w-4 h-4" />
                    {verifyingAll === true ? "Confirmando..." : "Marcar todos como confirmados"}
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
                        requirements.map((req) => (
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
                                    {isExclusionary(req.roles) && (
                                        <span
                                            title="El incumplimiento de este requisito rechaza la propuesta"
                                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100"
                                        >
                                            Excluyente
                                        </span>
                                    )}
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
                                </div>

                                {/* Citations */}
                                <CitationsToggle citations={req.citations} />

                                {/* Footer: notes + is_verified */}
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-50">
                                    <div className="flex-1">
                                        {req.notes && (
                                            <p className="text-xs text-zinc-400 italic">{req.notes}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleVerifyToggle(req)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${req.is_verified
                                                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                                : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100"
                                            }`}
                                    >
                                        <CheckCircle2 className={`w-3.5 h-3.5 ${req.is_verified ? "text-green-600" : "text-zinc-400"}`} />
                                        {req.is_verified ? "Confirmado" : "Confirmar requisito"}
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                            <div className="bg-zinc-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ShieldCheck className="w-6 h-6 text-zinc-400" />
                            </div>
                            <p className="text-zinc-500 font-medium">No se encontraron requisitos de admisibilidad</p>
                            <p className="text-zinc-400 text-sm mt-1">Este análisis no tiene requisitos de admisibilidad asociados.</p>
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
                                {requirements.length} requisitos cargados
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
