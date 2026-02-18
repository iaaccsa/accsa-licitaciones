"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Calendar, FileText, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ComplianceResultsList from "@/components/ComplianceResultsList";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed";
}

interface Proposal {
    id: string;
    analysis_id: string;
    provider_name: string | null;
    label: string | null;
    status: string;
    is_success: boolean | null;
    audit_results: Record<string, unknown> | null;
    created_at: string;
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
            <div className="flex flex-col gap-4">
                <Button
                    variant="ghost"
                    className="w-fit -ml-2 text-zinc-500 hover:text-zinc-900"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver al análisis
                </Button>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <FileText className="w-4 h-4" />
                        <span>Análisis: {analysis.slug}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold bg-linear-to-r from-zinc-900 to-zinc-600 bg-clip-text text-transparent">
                            {proposal.label || "Detalle de Propuesta"}
                        </h1>
                        <ProposalStatusBadge status={proposal.status} isSuccess={proposal.is_success} />
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                        <span className="font-medium text-zinc-900">{proposal.provider_name || "Proveedor desconocido"}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            <div className="grid gap-6">
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
