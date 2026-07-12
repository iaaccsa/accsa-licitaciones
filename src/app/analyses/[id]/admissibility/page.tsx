"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, Loader2, AlertCircle, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

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
    label: string;
    provider_name: string | null;
    admissibility_status: AdmissibilityStatus | null;
}

export default function AdmissibilityPage() {
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

    const handleOverride = async (proposal: Proposal, next: "admitida" | "rechazada") => {
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

    const renderCard = (proposal: Proposal) => {
        const status = proposal.admissibility_status ?? "pending";
        const cfg = ADMISSIBILITY_CONFIG[status] ?? ADMISSIBILITY_CONFIG.pending;
        const resolved = status === "admitida" || status === "rechazada";

        return (
            <div
                key={proposal.id}
                className="flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5"
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
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
                        {cfg.label}
                    </span>
                </div>

                {resolved && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        {status === "admitida" ? (
                            <button
                                type="button"
                                onClick={() => handleOverride(proposal, "rechazada")}
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
                                onClick={() => handleOverride(proposal, "admitida")}
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
            </div>
        );
    };

    const admitidas = proposals.filter(p => p.admissibility_status === "admitida");
    const rechazadas = proposals.filter(p => p.admissibility_status === "rechazada");
    const otras = proposals.filter(p => p.admissibility_status !== "admitida" && p.admissibility_status !== "rechazada");

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
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
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Admisibilidad de propuestas</h1>
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

            {!isLoading && !error && proposals.length > 0 && (
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
            )}
        </div>
    );
}
