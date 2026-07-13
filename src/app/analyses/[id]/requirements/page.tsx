"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, CheckCheck, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/Pagination";

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
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}

const PAGE_SIZE = 10;
const FETCH_BATCH = 200;

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
    admisibilidad_obligatoria: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900",
    admisibilidad_subsanable: "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-900",
    puntuable: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-900",
    penalizador: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-900",
    informativo: "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
    preferencia_legal: "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-900",
    desconocido_pendiente_pliego_general: "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-900",
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
    alta: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-100 dark:border-green-900",
    media: "bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-900",
    baja: "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-900",
    muy_baja: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900",
};

const CONFIDENCE_LABELS: Record<string, string> = {
    alta: "Alta", media: "Media", baja: "Baja", muy_baja: "Muy baja",
};

function CitationsToggle({ citations }: { citations: Citation[] }) {
    const [expanded, setExpanded] = useState(true);
    if (citations.length === 0) return null;
    return (
        <div className="mt-3">
            <button
                onClick={() => setExpanded(v => !v)}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? "Ocultar citas" : `Ver ${citations.length} cita${citations.length > 1 ? "s" : ""}`}
            </button>
            {expanded && (
                <div className="mt-2 space-y-2">
                    {citations.map((c, i) => (
                        <div key={i} className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2">
                            <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                                {c.filename ?? "Documento desconocido"}
                                {c.page_number != null && ` — Página ${c.page_number}`}
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 italic leading-relaxed">"{c.snippet}"</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function RequirementCard({ req, onVerifySet }: {
    req: AnalysisRequirementRead;
    onVerifySet: (req: AnalysisRequirementRead, isVerified: boolean) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const weightVisible = req.weight && req.weight.type !== "none";
    return (
        <div className="cv-auto bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all duration-200">
            {/* Header: code + text + expand toggle */}
            <div
                className="flex items-start gap-3 md:gap-6 cursor-pointer select-none pb-4 border-b border-zinc-200 dark:border-zinc-800"
                onClick={() => setExpanded(v => !v)}
            >
                <span className="min-w-[80px] md:min-w-[100px] shrink-0 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {req.requirement_code}
                </span>
                <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed">
                        {req.requirement_text}
                    </p>
                    {req.requirement_summary && (
                        <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1 leading-relaxed">
                            {req.requirement_summary}
                        </p>
                    )}
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </div>

            {expanded && (
                <div className="pt-4">
                    {/* Tags: roles + domain + temporal_scope + verification_method + confidence */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        {req.roles.map(role => (
                            <span
                                key={role}
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] ?? "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"}`}
                            >
                                Rol: {ROLE_LABELS[role] ?? role}
                            </span>
                        ))}
                        {req.domain && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
                                Dominio: {DOMAIN_LABELS[req.domain] ?? req.domain}
                            </span>
                        )}
                        {req.temporal_scope && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                                Alcance: {SCOPE_LABELS[req.temporal_scope] ?? req.temporal_scope}
                            </span>
                        )}
                        {req.verification_method && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                                Verificación: {VERIFICATION_LABELS[req.verification_method] ?? req.verification_method}
                            </span>
                        )}
                        {req.confidence && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CONFIDENCE_COLORS[req.confidence] ?? "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"}`}>
                                Confianza: {CONFIDENCE_LABELS[req.confidence] ?? req.confidence}
                            </span>
                        )}
                    </div>

                    {/* Weight */}
                    {weightVisible && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">Peso:</span>{" "}
                            {req.weight!.type === "formula"
                                ? `formula: ${req.weight!.formula}`
                                : `${req.weight!.value} ${req.weight!.type}`}
                            {req.weight!.block && ` · ${req.weight!.block}`}
                        </div>
                    )}

                    {/* Mapped factors */}
                    {req.mapped_factors.length > 0 && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 flex flex-wrap gap-2">
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">Factores:</span>
                            {req.mapped_factors.map((f, i) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded font-mono">
                                    {f.factor_id}
                                    {f.weight_value !== null && ` · ${f.weight_value} ${f.weight_type}`}
                                    {f.block && ` · ${f.block}`}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Citations */}
                    <CitationsToggle citations={req.citations} />
                </div>
            )}

            {/* Footer: notes + is_verified */}
            <div className="flex items-center justify-between gap-4 mt-4">
                <div className="flex-1">
                    {req.notes && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{req.notes}</p>
                    )}
                </div>
                <div className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <button
                        onClick={() => onVerifySet(req, true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${req.is_verified
                            ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                            : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            }`}
                    >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${req.is_verified ? "text-green-600 dark:text-green-400" : "text-zinc-400 dark:text-zinc-500"}`} />
                        Confirmar
                    </button>
                    <span className="self-stretch w-px bg-zinc-200 dark:bg-zinc-800" />
                    <button
                        onClick={() => onVerifySet(req, false)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${!req.is_verified
                            ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
                            : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            }`}
                    >
                        <XCircle className={`w-3.5 h-3.5 ${!req.is_verified ? "text-red-600 dark:text-red-400" : "text-zinc-400 dark:text-zinc-500"}`} />
                        Rechazar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function RequirementsPage() {
    const params = useParams();
    const id = params.id as string;

    const [requirements, setRequirements] = useState<AnalysisRequirementRead[]>([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [verifyingAll, setVerifyingAll] = useState<boolean | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            const all: AnalysisRequirementRead[] = [];
            let offset = 0;
            while (true) {
                const response = await fetch(`/api/analyses/${id}/requirements?limit=${FETCH_BATCH}&offset=${offset}`);
                if (!response.ok) throw new Error("Error al cargar los requisitos");
                const data: AnalysisRequirementRead[] = await response.json();
                const items = Array.isArray(data) ? data : [];
                all.push(...items);
                if (items.length < FETCH_BATCH) break;
                offset += items.length;
            }
            setRequirements(all);
        } catch (err) {
            console.error(err);
            setError("Error al cargar los datos");
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    const handleVerifySet = useCallback(async (req: AnalysisRequirementRead, newValue: boolean) => {
        if (req.is_verified === newValue) return;
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

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (id) fetchAll();
    }, [id, fetchAll]);

    const totalPages = Math.max(1, Math.ceil(requirements.length / PAGE_SIZE));
    const pageItems = requirements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const goToPage = (p: number) => {
        setPage(p);
        window.scrollTo({ top: 0 });
    };

    if (error) {
        return (
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
                <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 md:p-8 space-y-6">
                <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-green-600 dark:text-green-400" />
                        Requisitos
                    </h1>
                </div>

                {/* Verify-all actions */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 p-2">
                    <button
                        onClick={() => handleVerifyAll(true)}
                        disabled={verifyingAll !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <CheckCheck className="w-4 h-4" />
                        {verifyingAll === true ? "Confirmando..." : "Confirmar todos"}
                    </button>
                    <button
                        onClick={() => handleVerifyAll(false)}
                        disabled={verifyingAll !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <XCircle className="w-4 h-4" />
                        {verifyingAll === false ? "Rechazando..." : "Rechazar todos"}
                    </button>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
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
                            pageItems.map((req) => (
                                <RequirementCard key={req.id} req={req} onVerifySet={handleVerifySet} />
                            ))
                        ) : (
                            <div className="text-center py-16 rounded-xl border border-zinc-200 dark:border-zinc-800 border-dashed">
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <ClipboardList className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
                                </div>
                                <p className="text-zinc-500 dark:text-zinc-400 font-medium">No se encontraron requisitos</p>
                                <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">Este análisis no tiene requisitos asociados.</p>
                            </div>
                        )}

                        <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
                    </div>
                )}
            </div>
        </div>
    );
}
