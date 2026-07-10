"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Calendar, FileText, AlertCircle, Building2, Sparkles, Clock, XCircle, ShieldCheck, ClipboardList, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EconomicOfferCard from "@/components/EconomicOfferCard";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed" | "awaiting_approval" | "cancelled";
    paused_at_service: string | null;
}

type MatchingStatus =
    | "pending"
    | "matching"
    | "matrix_ready"
    | "summarizing"
    | "completed"
    | "failed"
    | "summary_failed";

interface Proposal {
    id: string;
    analysis_id: string;
    label: string;
    provider_name: string | null;
    provider_metadata: Record<string, unknown> | null;
    matching_status: MatchingStatus;
    matching_error: string | null;
    summary_error: string | null;
    summarizing_started_at: string | null;
    summarizing_completed_at: string | null;
    compliance_rate: number | null;
    compliance_counts: Record<string, number> | null;
    compliance_summary: string | null;
    critical_failures_count: number | null;
    created_at: string;
    updated_at: string;
}

function SummaryStatusBadge({ proposal }: { proposal: Proposal }) {
    if (proposal.summary_error) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                <XCircle className="w-3.5 h-3.5" />
                Resumen con error
            </span>
        );
    }
    if (proposal.compliance_summary) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                <Sparkles className="w-3.5 h-3.5" />
                Resumen listo
            </span>
        );
    }
    if (proposal.summarizing_started_at && !proposal.summarizing_completed_at) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generando resumen
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5" />
            Resumen pendiente
        </span>
    );
}

function ComplianceBreakdownBar({ counts }: { counts: Record<string, number> }) {
    const cumple = counts.compliant ?? counts.cumple ?? 0;
    const parcial = counts.partial ?? counts.cumple_parcial ?? 0;
    const noCumple = counts.non_compliant ?? counts.no_cumple ?? 0;
    const sinInfo = counts.missing_info ?? counts.no_aplica ?? counts.missing ?? 0;
    const total = cumple + parcial + noCumple + sinInfo;
    if (total === 0) return null;
    const pct = (n: number) => (n / total) * 100;
    return (
        <div className="space-y-2 mb-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {cumple > 0 && <div className="bg-emerald-500" style={{ width: `${pct(cumple)}%` }} />}
                {parcial > 0 && <div className="bg-amber-500" style={{ width: `${pct(parcial)}%` }} />}
                {noCumple > 0 && <div className="bg-red-500" style={{ width: `${pct(noCumple)}%` }} />}
                {sinInfo > 0 && <div className="bg-zinc-300 dark:bg-zinc-600" style={{ width: `${pct(sinInfo)}%` }} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                {cumple > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Cumple <span className="tabular-nums font-semibold">{cumple}</span>
                    </span>
                )}
                {parcial > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Parcial <span className="tabular-nums font-semibold">{parcial}</span>
                    </span>
                )}
                {noCumple > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        No cumple <span className="tabular-nums font-semibold">{noCumple}</span>
                    </span>
                )}
                {sinInfo > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        Sin info <span className="tabular-nums font-semibold">{sinInfo}</span>
                    </span>
                )}
            </div>
        </div>
    );
}


export default function ProposalDetailPage() {
    const params = useParams();
    const router = useRouter();
    const analysisId = params.id as string;
    const proposalId = params.proposalId as string;

    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Analysis details and proposals are independent: fetch in parallel.
                // Note: Ideally we would have a direct endpoint for a single proposal,
                // but for now we reuse the list endpoint and filter.
                const [analysisRes, proposalsRes] = await Promise.all([
                    fetch(`/api/analyses/${analysisId}`),
                    fetch(`/api/analyses/${analysisId}/proposals`),
                ]);

                if (!analysisRes.ok) throw new Error("Error fetching analysis details");
                const analysisData = await analysisRes.json();
                setAnalysis(analysisData);

                if (!proposalsRes.ok) throw new Error("Error fetching proposals");
                const proposalsData = await proposalsRes.json();

                const foundProposal = Array.isArray(proposalsData)
                    ? proposalsData.find((p: Proposal) => p.id === proposalId)
                    : null;

                if (foundProposal) {
                    setProposal(foundProposal);
                } else {
                    setError("Propuesta no encontrada");
                }

            } catch (err) {
                console.error(err);
                setError("No se pudo cargar la información.");
            } finally {
                setIsLoading(false);
            }
        };

        if (analysisId && proposalId) {
            fetchData();
        }
    }, [analysisId, proposalId]);

    if (isLoading) {
        return (
            <div className="flex h-[50vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !analysis || !proposal) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <p className="font-medium">{error || "Error desconocido"}</p>
                </div>
                <Button variant="outline" onClick={() => router.back()}>
                    Volver
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3">
                <Button
                    variant="ghost"
                    className="w-fit -ml-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver al listado de propuestas
                </Button>

                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center justify-between gap-6">
                    {/* Left: icon + title + metadata */}
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2.5 bg-blue-50 dark:bg-blue-950 rounded-lg text-blue-500 dark:text-blue-400 shrink-0">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {proposal.label || "Propuesta"}
                                </span>
                                <SummaryStatusBadge proposal={proposal} />
                            </div>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                <span className="flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5" />
                                    {proposal.provider_name || "Proveedor desconocido"}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {new Date(proposal.created_at).toLocaleDateString()}
                                </span>
                                <span className="flex items-center gap-1 font-mono">
                                    <FileText className="w-3.5 h-3.5" />
                                    {analysis.slug}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: metrics */}
                    <div className="flex items-center divide-x divide-zinc-100 dark:divide-zinc-800 shrink-0">
                        {proposal.compliance_counts?.compliant != null && (
                            <div className="px-5 text-center">
                                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Cumple</p>
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{proposal.compliance_counts.compliant}</p>
                            </div>
                        )}
                        {proposal.compliance_counts?.non_compliant != null && (
                            <div className="px-5 text-center">
                                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">No cumple</p>
                                <p className="text-sm font-bold text-red-500 dark:text-red-400">{proposal.compliance_counts.non_compliant}</p>
                            </div>
                        )}
                        {proposal.compliance_counts?.missing_info != null && (
                            <div className="px-5 text-center">
                                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Sin info</p>
                                <p className="text-sm font-bold text-amber-500 dark:text-amber-400">{proposal.compliance_counts.missing_info}</p>
                            </div>
                        )}
                        {proposal.critical_failures_count != null && (
                            <div className="px-5 text-center">
                                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Críticos</p>
                                <p className="text-sm font-bold text-red-600 dark:text-red-400">{proposal.critical_failures_count}</p>
                            </div>
                        )}
                        {proposal.compliance_rate != null && (
                            <div className="px-5 text-center">
                                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Cumplimiento</p>
                                <p className="text-base font-bold text-zinc-800 dark:text-zinc-200">{Math.round(proposal.compliance_rate)}<span className="text-zinc-400 dark:text-zinc-500 text-sm">%</span></p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid gap-6 min-w-0">
                {proposal.provider_metadata && (
                    <Card className="min-w-0">
                        <CardHeader>
                            <CardTitle>Información del Proveedor</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <pre className="text-xs font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-lg p-4 overflow-y-auto max-h-[500px] whitespace-pre-wrap break-all">
                                {JSON.stringify(proposal.provider_metadata, (_, v) => v === null ? undefined : v, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                )}

                {(proposal.compliance_summary || proposal.compliance_counts) && (
                    <Card className="min-w-0">
                        <CardHeader>
                            <CardTitle>Resumen de Auditoría</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {proposal.compliance_counts && (
                                <ComplianceBreakdownBar counts={proposal.compliance_counts} />
                            )}
                            {proposal.compliance_summary && (
                                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{proposal.compliance_summary}</p>
                            )}
                        </CardContent>
                    </Card>
                )}

                <EconomicOfferCard analysisId={analysisId} proposalId={proposalId} />

                <div className="grid gap-4 sm:grid-cols-2">
                    <a
                        href={`/analyses/${analysisId}/proposals/${proposalId}/admissibility`}
                        className="relative flex items-center gap-4 p-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-violet-300 hover:shadow-md transition-all group"
                    >
                        {analysis?.status === "awaiting_approval" && analysis.paused_at_service === "service-admissibility-gate" && (
                            <span className="absolute top-2 right-2 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                            </span>
                        )}
                        <div className="p-3 bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-colors shrink-0">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                Admisibilidad
                            </h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Requisitos excluyentes y resultados
                            </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-500 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors shrink-0" />
                    </a>

                    <a
                        href={`/analyses/${analysisId}/proposals/${proposalId}/requirements`}
                        className="flex items-center gap-4 p-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-green-300 hover:shadow-md transition-all group"
                    >
                        <div className="p-3 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors shrink-0">
                            <ClipboardList className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                                Matriz de Cumplimiento
                            </h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Requisitos y nivel de cumplimiento
                            </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-500 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors shrink-0" />
                    </a>
                </div>
            </div>
        </div>
    );
}
