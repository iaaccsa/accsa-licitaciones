"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle, XCircle, AlertCircle, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Proposal {
    id: string;
    provider_name: string;
    label: string;
    status: string;
    is_success: boolean | null;
    audit_results: Record<string, unknown>;
    created_at: string;
}

interface ProposalsListProps {
    analysisId: string;
}

export default function ProposalsList({ analysisId }: ProposalsListProps) {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProposals = async () => {
            try {
                const response = await fetch(`/api/analyses/${analysisId}/proposals`);
                if (!response.ok) {
                    throw new Error("Failed to fetch proposals");
                }
                const data = await response.json();
                setProposals(data);
            } catch (err) {
                console.error(err);
                setError("Error al cargar las propuestas.");
            } finally {
                setIsLoading(false);
            }
        };

        if (analysisId) {
            fetchProposals();
        }
    }, [analysisId]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-zinc-900">Propuestas</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="h-40">
                            <CardHeader className="pb-2">
                                <Skeleton className="h-4 w-3/4" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-4 w-1/2 mb-2" />
                                <Skeleton className="h-4 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
            </div>
        );
    }

    if (proposals.length === 0) {
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-zinc-900">Propuestas</h2>
                <div className="p-8 text-center bg-zinc-50 rounded-xl border border-zinc-200 border-dashed">
                    <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500">No se encontraron propuestas para este análisis.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold text-zinc-900">Propuestas ({proposals.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {proposals.map((proposal) => (
                    <Link key={proposal.id} href={`/analyses/${analysisId}/proposals/${proposal.id}`}>
                        <Card className="hover:shadow-md transition-shadow h-full">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {proposal.provider_name || "Proveedor sin nombre"}
                                </CardTitle>
                                <ProposalStatusBadge status={proposal.status} isSuccess={proposal.is_success} />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{proposal.label || "Sin etiqueta"}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(proposal.created_at).toLocaleDateString()}
                                </p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}

function ProposalStatusBadge({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "pending") {
        return (
            <span className="flex items-center gap-1 text-xs text-zinc-500 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                Pendiente
            </span>
        );
    }

    if (status === "processed" || status === "Finished") {
        return isSuccess ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-100">
                <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span className="text-xs font-medium text-green-700">Completado</span>
            </div>
        ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span className="text-xs font-medium text-red-700">Fallido</span>
            </div>
        );
    }

    // Fallback
    return (
        <span className="text-xs text-zinc-400 font-medium capitalize">{status}</span>
    );
}
