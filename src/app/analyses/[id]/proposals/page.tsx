"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, Calendar, AlertTriangle, Loader2, AlertCircle, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

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
    pending: { label: "Pendiente", color: "bg-zinc-100 text-zinc-500" },
    evaluating: { label: "Evaluando", color: "bg-blue-50 text-blue-600" },
    admitida: { label: "Admitida", color: "bg-emerald-50 text-emerald-700" },
    rechazada: { label: "Rechazada", color: "bg-red-50 text-red-600" },
    failed: { label: "Error", color: "bg-orange-50 text-orange-600" },
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
    pending: { label: "Pendiente", color: "bg-zinc-100 text-zinc-600", icon: <Clock className="w-3.5 h-3.5" /> },
    matching: { label: "Evaluando", color: "bg-blue-50 text-blue-600", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    matrix_ready: { label: "Matriz lista", color: "bg-indigo-50 text-indigo-600", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    summarizing: { label: "Resumiendo", color: "bg-violet-50 text-violet-600", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    completed: { label: "Completado", color: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    failed: { label: "Fallido", color: "bg-red-50 text-red-600", icon: <XCircle className="w-3.5 h-3.5" /> },
    summary_failed: { label: "Error en resumen", color: "bg-orange-50 text-orange-600", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
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
            <div className="flex-1 bg-zinc-100 rounded-full h-1.5 min-w-[60px]">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-zinc-700 tabular-nums w-8 text-right">{pct}%</span>
        </div>
    );
}

export default function ProposalsPage() {
    const params = useParams();
    const id = params.id as string;

    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [overridingId, setOverridingId] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/analyses/${id}/proposals`);
                if (!res.ok) throw new Error(`Error ${res.status}`);
                const data = await res.json();
                setProposals(Array.isArray(data) ? data : []);
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
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al análisis
                </Link>
            </div>

            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-zinc-900">Propuestas</h1>
                {!isLoading && !error && (
                    <span className="text-sm text-zinc-500">{proposals.length} propuesta{proposals.length !== 1 ? "s" : ""}</span>
                )}
            </div>

            {isLoading && (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {!isLoading && !error && proposals.length === 0 && (
                <div className="text-center py-16 text-zinc-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No hay propuestas asociadas a este analisis.</p>
                </div>
            )}

            {!isLoading && !error && proposals.length > 0 && (
                <div className="space-y-3">
                    {proposals.map((proposal) => {
                        const counts = proposal.compliance_counts ?? {};
                        const compliant = counts.compliant ?? counts.compliant_count ?? null;
                        const nonCompliant = counts.non_compliant ?? counts.non_compliant_count ?? null;
                        const missing = counts.missing_info ?? counts.missing ?? null;
                        const hasError = proposal.matching_status === "failed" || proposal.matching_status === "summary_failed";
                        const errorMsg = proposal.matching_error || proposal.summary_error;

                        return (
                            <Link
                                key={proposal.id}
                                href={`/analyses/${id}/proposals/${proposal.id}`}
                                className="block bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all px-5 py-4"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-500 shrink-0">
                                        <FileText className="w-5 h-5" />
                                    </div>

                                    {/* Main info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-zinc-900 truncate">{proposal.label}</span>
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
                                        <div className="flex items-center flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
                                            {proposal.provider_name && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5" />
                                                    {proposal.provider_name}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {new Date(proposal.created_at).toLocaleDateString("es-ES")}
                                            </span>
                                        </div>
                                        {hasError && errorMsg && (
                                            <p className="mt-1 text-xs text-red-500 truncate">{errorMsg}</p>
                                        )}
                                    </div>

                                    {/* Metrics */}
                                    <div className="flex items-center gap-5 shrink-0">
                                        {proposal.compliance_rate != null && (
                                            <div className="w-32">
                                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Cumplimiento</p>
                                                <ComplianceBar rate={proposal.compliance_rate} />
                                            </div>
                                        )}
                                        <div className="flex items-center divide-x divide-zinc-100">
                                            {compliant != null && (
                                                <div className="px-3 text-center">
                                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Cumple</p>
                                                    <p className="text-sm font-bold text-emerald-600">{compliant}</p>
                                                </div>
                                            )}
                                            {nonCompliant != null && (
                                                <div className="px-3 text-center">
                                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">No cumple</p>
                                                    <p className="text-sm font-bold text-red-500">{nonCompliant}</p>
                                                </div>
                                            )}
                                            {missing != null && (
                                                <div className="px-3 text-center">
                                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Sin info</p>
                                                    <p className="text-sm font-bold text-amber-500">{missing}</p>
                                                </div>
                                            )}
                                            {proposal.critical_failures_count != null && proposal.critical_failures_count > 0 && (
                                                <div className="px-3 text-center">
                                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Criticos</p>
                                                    <p className="text-sm font-bold text-red-600 flex items-center gap-1">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        {proposal.critical_failures_count}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        {proposal.admissibility_status === "admitida" && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleOverride(e, proposal, "rechazada")}
                                                disabled={overridingId === proposal.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {overridingId === proposal.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <XCircle className="w-3.5 h-3.5" />
                                                )}
                                                Rechazar
                                            </button>
                                        )}
                                        {proposal.admissibility_status === "rechazada" && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleOverride(e, proposal, "admitida")}
                                                disabled={overridingId === proposal.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
