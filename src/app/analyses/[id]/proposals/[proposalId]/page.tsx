"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Calendar, FileText, CheckCircle, XCircle, Clock, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ComplianceResultsList from "@/components/ComplianceResultsList";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed";
}

interface ProviderMetadata {
    email: string | null;
    phone: string | null;
    tax_id: string | null;
    address: string | null;
    company_name: string | null;
    representative_name: string | null;
    additional: Record<string, string | number | boolean | null> | null;
}

interface Proposal {
    id: string;
    analysis_id: string;
    provider_name: string | null;
    label: string | null;
    status: string;
    is_success: boolean | null;
    audit_results: Record<string, unknown> | null;
    provider_metadata: ProviderMetadata | null;
    created_at: string;
    compliant_count: number | null;
    non_compliant_count: number | null;
    missing_info_count: number | null;
    unprocessable_count: number | null;
}

function ProposalStatusBadge({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "pending") {
        return (
            <Badge variant="outline" className="border-zinc-200 text-zinc-500 bg-zinc-50">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Pendiente
            </Badge>
        );
    }

    if (status === "processed" || status === "finished") {
        if (isSuccess) {
            return (
                <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 border-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Exitoso
                </Badge>
            );
        } else {
            return (
                <Badge variant="destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Fallido
                </Badge>
            );
        }
    }

    return (
        <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {status}
        </Badge>
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
                // Fetch Analysis Details
                const analysisRes = await fetch(`/api/analyses/${analysisId}`);
                if (!analysisRes.ok) throw new Error("Error fetching analysis details");
                const analysisData = await analysisRes.json();
                setAnalysis(analysisData);

                // Fetch Proposals and find specific one
                // Note: Ideally we would have a direct endpoint for a single proposal,
                // but for now we reuse the list endpoint and filter.
                const proposalsRes = await fetch(`/api/analyses/${analysisId}/proposals`);
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
        <div className="container mx-auto max-w-5xl py-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3">
                <Button
                    variant="ghost"
                    className="w-fit -ml-2 text-zinc-500 hover:text-zinc-900"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver al análisis
                </Button>

                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm px-5 py-4 flex items-center justify-between gap-6">
                    {/* Left: icon + title + metadata */}
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2.5 bg-blue-50 rounded-lg text-blue-500 shrink-0">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-zinc-900 truncate">
                                    {proposal.label || "Propuesta"}
                                </span>
                                <ProposalStatusBadge status={proposal.status} isSuccess={proposal.is_success} />
                            </div>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
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
                    <div className="flex items-center divide-x divide-zinc-100 shrink-0">
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Estado</p>
                            <p className="text-sm font-semibold text-zinc-700">
                                {{ pending: "Pendiente", processed: "En Ejecución", finished: "Finalizado" }[proposal.status] ?? proposal.status}
                            </p>
                        </div>
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Resultado</p>
                            {proposal.is_success === null ? (
                                <span className="text-sm font-semibold text-zinc-400">—</span>
                            ) : proposal.is_success ? (
                                <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                                    <CheckCircle className="w-4 h-4" /> Exitoso
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-sm font-semibold text-red-500">
                                    <XCircle className="w-4 h-4" /> Fallido
                                </span>
                            )}
                        </div>
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Cumple</p>
                            <p className="text-sm font-bold text-emerald-600">{proposal.compliant_count ?? "—"}</p>
                        </div>
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">No cumple</p>
                            <p className="text-sm font-bold text-red-500">{proposal.non_compliant_count ?? "—"}</p>
                        </div>
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Sin info</p>
                            <p className="text-sm font-bold text-amber-500">{proposal.missing_info_count ?? "—"}</p>
                        </div>
                        <div className="px-5 text-center">
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">N/A</p>
                            <p className="text-sm font-bold text-zinc-400">{proposal.unprocessable_count ?? "—"}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-6">
                {proposal.provider_metadata && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Información del Proveedor</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <pre className="text-xs font-mono text-zinc-800 bg-zinc-50 border border-zinc-100 rounded-lg p-4 overflow-y-auto max-h-[500px] whitespace-pre-wrap break-all">
                                {JSON.stringify(proposal.provider_metadata, (_, v) => v === null ? undefined : v, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Resultados de Auditoría</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {proposal.audit_results ? (
                            <pre className="bg-zinc-50 p-4 rounded-lg overflow-auto text-xs font-mono border text-zinc-800">
                                {JSON.stringify(proposal.audit_results, null, 2)}
                            </pre>
                        ) : (
                            <div className="text-center py-8 text-zinc-500 italic">
                                No hay resultados de auditoría reportados en la propuesta.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <ComplianceResultsList analysisId={analysisId} proposalId={proposalId} />
            </div>
        </div>
    );
}
