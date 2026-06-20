"use client";

import { Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProposals } from "@/lib/use-proposals";

interface Proposal {
    id: string;
    label: string;
    matching_status: "pending" | "matching" | "matrix_ready" | "summarizing" | "completed" | "failed" | "summary_failed";
    compliance_rate: number | null;
    critical_failures_count: number | null;
}

const STATUS_LABELS: Record<Proposal["matching_status"], string> = {
    pending: "Pendiente",
    matching: "Procesando",
    matrix_ready: "Procesando",
    summarizing: "Procesando",
    completed: "Completada",
    failed: "Fallida",
    summary_failed: "Fallida",
};

const STATUS_STYLES: Record<Proposal["matching_status"], string> = {
    pending: "bg-zinc-100 text-zinc-600",
    matching: "bg-blue-100 text-blue-700",
    matrix_ready: "bg-blue-100 text-blue-700",
    summarizing: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    summary_failed: "bg-red-100 text-red-700",
};

interface Props {
    analysisId: string;
}

export default function ProposalsSummary({ analysisId }: Props) {
    const { proposals, isLoading } = useProposals<Proposal>(analysisId);

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                    <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-500" />
                        Resumen de Propuestas
                    </h3>
                </div>
                {[1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100 last:border-0">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (!proposals || proposals.length === 0) return null;

    const leaderId = proposals
        .filter((p) => p.matching_status === "completed" && p.compliance_rate !== null)
        .sort((a, b) => (b.compliance_rate ?? -1) - (a.compliance_rate ?? -1))[0]?.id ?? null;

    return (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <Users className="w-4 h-4 text-zinc-500" />
                    Resumen de Propuestas
                </h3>
                <span className="text-sm font-semibold text-zinc-500">{proposals.length}</span>
            </div>
            {proposals.map((p) => {
                const isLeader = p.id === leaderId;
                return (
                    <div
                        key={p.id}
                        className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100 last:border-0"
                    >
                        <span className="flex-1 text-sm font-medium text-zinc-800 truncate">{p.label}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_STYLES[p.matching_status]}`}>
                            {STATUS_LABELS[p.matching_status]}
                        </span>
                        {isLeader && p.compliance_rate !== null && (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 shrink-0">
                                <Trophy className="w-3.5 h-3.5" />
                                Lider · {p.compliance_rate.toFixed(1)}%
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
