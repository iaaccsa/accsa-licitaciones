"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, Calendar, AlertTriangle, Loader2, AlertCircle, FileText, CheckCircle2, XCircle, Clock, Coins } from "lucide-react";
import Link from "next/link";
import { formatAmount, type EconomicOffer } from "@/components/EconomicOfferCard";

type MatchingStatus =
    | "pending"
    | "matching"
    | "matrix_ready"
    | "summarizing"
    | "completed"
    | "failed"
    | "summary_failed";

type AdmissibilityStatus = "failed" | "pending" | "admitida" | "rechazada" | "evaluating";

const ADMISSIBILITY_CONFIG: Record<AdmissibilityStatus, { label: string; color: string }> = {
    pending: { label: "Pendiente", color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400" },
    evaluating: { label: "Evaluando", color: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400" },
    admitida: { label: "Admitida", color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" },
    rechazada: { label: "Rechazada", color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" },
    failed: { label: "Error", color: "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400" },
};

interface Proposal {
    id: string;
    analysis_id: string;
    label: string;
    provider_name: string | null;
    provider_metadata: Record<string, unknown> | null;
    matching_status: MatchingStatus;
    admissibility_status: AdmissibilityStatus | null;
    matching_started_at: string | null;
    matching_completed_at: string | null;
    matching_error: string | null;
    summarizing_started_at: string | null;
    summarizing_completed_at: string | null;
    summary_error: string | null;
    compliance_rate: number | null;
    compliance_counts: Record<string, number> | null;
    compliance_summary: string | null;
    critical_failures_count: number | null;
    created_at: string;
    updated_at: string;
}

const STATUS_CONFIG: Record<MatchingStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: "Pendiente", color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400", icon: <Clock className="w-3.5 h-3.5" /> },
    matching: { label: "Evaluando", color: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    matrix_ready: { label: "Matriz lista", color: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    summarizing: { label: "Resumiendo", color: "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    completed: { label: "Completado", color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    failed: { label: "Fallido", color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400", icon: <XCircle className="w-3.5 h-3.5" /> },
    summary_failed: { label: "Error en resumen", color: "bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function StatusBadge({ status }: { status: MatchingStatus }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

function ComplianceBar({ rate }: { rate: number }) {
    const pct = Math.round(rate);
    const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 min-w-[60px]">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums w-8 text-right">{pct}%</span>
        </div>
    );
}

export default function ProposalsPage() {
    const params = useParams();
    const id = params.id as string;

    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [economicByProposal, setEconomicByProposal] = useState<Record<string, EconomicOffer>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [overridingId, setOverridingId] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [proposalsRes, offersRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/proposals`),
                    fetch(`/api/analyses/${id}/economic-offers`),
                ]);
                if (!proposalsRes.ok) throw new Error(`Error ${proposalsRes.status}`);
                const data = await proposalsRes.json();
                setProposals(Array.isArray(data) ? data : []);
                if (offersRes.ok) {
                    const offers = (await offersRes.json()) as EconomicOffer[];
                    if (Array.isArray(offers)) {
                        setEconomicByProposal(
                            offers.reduce(
                                (acc, o) => ({ ...acc, [o.proposal_id]: o }),
                                {} as Record<string, EconomicOffer>,
                            ),
                        );
                    }
                }
            } catch {
                setError("No se pudo cargar la lista de propuestas.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [id]);

    const handleOverride = async (
        e: React.MouseEvent,
        proposal: Proposal,
        next: "admitida" | "rechazada",
    ) => {
        e.preventDefault();
        e.stopPropagation();
        if (overridingId) return;
        setOverridingId(proposal.id);
        const prev = proposal.admissibility_status;
        setProposals(list =>
            list.map(p => (p.id === proposal.id ? { ...p, admissibility_status: next } : p)),
        );
        try {
            const res = await fetch(
                `/api/analyses/${id}/proposals/${proposal.id}/admissibility-override`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ admissibility_status: next }),
                },
            );
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const updated = await res.json();
            setProposals(list => list.map(p => (p.id === proposal.id ? { ...p, ...updated } : p)));
        } catch {
            setProposals(list =>
                list.map(p => (p.id === proposal.id ? { ...p, admissibility_status: prev } : p)),
            );
        } finally {
            setOverridingId(null);
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center gap-3">
                <Link
                    href={`/analyses/${id}`}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al análisis
                </Link>
            </div>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Propuestas</h1>
                {!isLoading && !error && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{proposals.length} propuesta{proposals.length !== 1 ? "s" : ""}</span>
                )}
            </div>

            {isLoading && (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 dark:text-zinc-500" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 py-8 justify-center">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {!isLoading && !error && proposals.length === 0 && (
                <div className="text-center py-16 text-zinc-400 dark:text-zinc-500">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No hay propuestas asociadas a este analisis.</p>
                </div>
            )}

            {!isLoading && !error && proposals.length > 0 && (() => {
                const admitidas = proposals.filter(p => p.admissibility_status === "admitida");
                const rechazadas = proposals.filter(p => p.admissibility_status === "rechazada");
                const otras = proposals.filter(p => p.admissibility_status !== "admitida" && p.admissibility_status !== "rechazada");

                const renderCard = (proposal: Proposal) => {
                    const counts = proposal.compliance_counts ?? {};
                    const compliant = counts.compliant ?? counts.compliant_count ?? null;
                    const nonCompliant = counts.non_compliant ?? counts.non_compliant_count ?? null;
                    const missing = counts.missing_info ?? counts.missing ?? null;
                    const hasError = proposal.matching_status === "failed" || proposal.matching_status === "summary_failed";
                    const errorMsg = proposal.matching_error || proposal.summary_error;
                    const offer = economicByProposal[proposal.id];
                    const hasCounts = compliant != null || nonCompliant != null || missing != null ||
                        (proposal.critical_failures_count != null && proposal.critical_failures_count > 0);

                    return (
                        <Link
                            key={proposal.id}
                            href={`/analyses/${id}/proposals/${proposal.id}`}
                            className="flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all p-5"
                        >
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg text-blue-500 dark:text-blue-400 shrink-0">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="block font-semibold text-zinc-900 dark:text-zinc-100 truncate">{proposal.label}</span>
                                    {proposal.provider_name && (
                                        <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{proposal.provider_name}</span>
                                        </span>
                                    )}
                                    <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                                        {new Date(proposal.created_at).toLocaleDateString("es-ES")}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <StatusBadge status={proposal.matching_status} />
                                {proposal.admissibility_status && (() => {
                                    const cfg = ADMISSIBILITY_CONFIG[proposal.admissibility_status] ?? ADMISSIBILITY_CONFIG.pending;
                                    return (
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                                            <span className="opacity-70">Admisibilidad:</span>
                                            {cfg.label}
                                        </span>
                                    );
                                })()}
                            </div>

                            {hasError && errorMsg && (
                                <p className="mt-2 text-xs text-red-500 dark:text-red-400 line-clamp-2">{errorMsg}</p>
                            )}

                            {(offer || proposal.compliance_rate != null) && (
                                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-end justify-between gap-4">
                                    {offer && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                <Coins className="w-3 h-3" />
                                                Oferta
                                            </p>
                                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                                                {formatAmount(offer.total_amount, offer.currency)}
                                            </p>
                                            {offer.requires_manual_review && (
                                                <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5 mt-0.5">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Revisar
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {proposal.compliance_rate != null && (
                                        <div className="flex-1 max-w-[160px]">
                                            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Cumplimiento</p>
                                            <ComplianceBar rate={proposal.compliance_rate} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {hasCounts && (
                                <div className="mt-3 grid grid-cols-4 divide-x divide-zinc-100 dark:divide-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 py-2">
                                    <div className="px-2 text-center">
                                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Cumple</p>
                                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{compliant ?? "-"}</p>
                                    </div>
                                    <div className="px-2 text-center">
                                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">No cumple</p>
                                        <p className="text-sm font-bold text-red-500 dark:text-red-400">{nonCompliant ?? "-"}</p>
                                    </div>
                                    <div className="px-2 text-center">
                                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Sin info</p>
                                        <p className="text-sm font-bold text-amber-500 dark:text-amber-400">{missing ?? "-"}</p>
                                    </div>
                                    <div className="px-2 text-center">
                                        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Criticos</p>
                                        <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
                                            {proposal.critical_failures_count != null && proposal.critical_failures_count > 0 && (
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                            )}
                                            {proposal.critical_failures_count ?? "-"}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {(proposal.admissibility_status === "admitida" || proposal.admissibility_status === "rechazada") && (
                                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                    {proposal.admissibility_status === "admitida" ? (
                                        <button
                                            type="button"
                                            onClick={(e) => handleOverride(e, proposal, "rechazada")}
                                            disabled={overridingId === proposal.id}
                                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {overridingId === proposal.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5" />
                                            )}
                                            Rechazar
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => handleOverride(e, proposal, "admitida")}
                                            disabled={overridingId === proposal.id}
                                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {overridingId === proposal.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            )}
                                            Admitir
                                        </button>
                                    )}
                                </div>
                            )}
                        </Link>
                    );
                };

                return (
                    <div className="space-y-8">
                        {admitidas.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Admitidas</h2>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{admitidas.length}</span>
                                    <div className="flex-1 h-px bg-emerald-100 dark:bg-emerald-950 ml-2" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{admitidas.map(renderCard)}</div>
                            </section>
                        )}

                        {rechazadas.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Rechazadas</h2>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{rechazadas.length}</span>
                                    <div className="flex-1 h-px bg-red-100 dark:bg-red-950 ml-2" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{rechazadas.map(renderCard)}</div>
                            </section>
                        )}

                        {otras.length > 0 && (
                            <section>
                                <div className="flex items-center gap-2 mb-3">
                                    <Clock className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Sin resolver</h2>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{otras.length}</span>
                                    <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800 ml-2" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{otras.map(renderCard)}</div>
                            </section>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
