"use client";

import { useEffect, useState, useCallback } from "react";
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

const PAGE_SIZE = 20;

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

function Pagination({
    page,
    totalPages,
    onChange,
}: {
    page: number;
    totalPages: number;
    onChange: (p: number) => void;
}) {
    if (totalPages <= 1) return null;

    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (page > 3) pages.push("...");
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
        if (page < totalPages - 2) pages.push("...");
        pages.push(totalPages);
    }

    const btn = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
    const active = `${btn} bg-zinc-900 text-white`;
    const inactive = `${btn} text-zinc-600 hover:bg-zinc-100 border border-zinc-200`;
    const nav = `${btn} text-zinc-600 hover:bg-zinc-100 border border-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed`;

    return (
        <div className="flex items-center justify-center gap-1.5 py-4">
            <button className={nav} onClick={() => onChange(1)} disabled={page === 1}>Primera</button>
            <button className={nav} onClick={() => onChange(page - 1)} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
            </button>
            {pages.map((p, i) =>
                p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-zinc-400 text-sm">...</span>
                ) : (
                    <button key={p} className={p === page ? active : inactive} onClick={() => onChange(p as number)}>
                        {p}
                    </button>
                )
            )}
            <button className={nav} onClick={() => onChange(page + 1)} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
            </button>
            <button className={nav} onClick={() => onChange(totalPages)} disabled={page === totalPages}>Última</button>
        </div>
    );
}

// Inline ChevronRight to avoid extra import grouping issues
function ChevronRight({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

export default function RequirementsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [allRequirements, setAllRequirements] = useState<AnalysisRequirementRead[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [verifyingAll, setVerifyingAll] = useState<boolean | null>(null);

    const totalPages = Math.ceil(allRequirements.length / PAGE_SIZE);
    const requirements = allRequirements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const fetchAll = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/analyses/${id}/requirements?limit=500&offset=0`);
            if (!response.ok) throw new Error("Error al cargar los requerimientos");
            const data: AnalysisRequirementRead[] = await response.json();
            setAllRequirements(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setError("Error al cargar los datos");
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    const handleVerifyToggle = useCallback(async (req: AnalysisRequirementRead) => {
        const newValue = !req.is_verified;
        setAllRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_verified: newValue } : r));
        try {
            const response = await fetch(`/api/requirements/${req.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_verified: newValue }),
            });
            if (!response.ok) throw new Error("Failed to update");
        } catch {
            setAllRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_verified: req.is_verified } : r));
        }
    }, []);

    const handleVerifyAll = useCallback(async (isVerified: boolean) => {
        setVerifyingAll(isVerified);
        try {
            const response = await fetch(`/api/analyses/${id}/requirements/verify-all?is_verified=${isVerified}`, {
                method: "PATCH",
            });
            if (!response.ok) throw new Error("Failed to update all");
            setAllRequirements(prev => prev.map(r => ({ ...r, is_verified: isVerified })));
        } catch (err) {
            console.error(err);
        } finally {
            setVerifyingAll(null);
        }
    }, [id]);

    const handlePageChange = useCallback((p: number) => {
        setPage(p);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (id) {
            fetch(`/api/analyses/${id}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => { if (data) setAnalysis(data); })
                .catch(console.error);
        }
    }, [id]);

    useEffect(() => {
        if (id) fetchAll();
    }, [id, fetchAll]);

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

            {/* Verify-all actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleVerifyAll(true)}
                    disabled={verifyingAll !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <CheckCheck className="w-4 h-4" />
                    {verifyingAll === true ? "Verificando..." : "Marcar todos como verificados"}
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
                <>
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

                    <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
                </>
            )}
        </div>
    );
}
