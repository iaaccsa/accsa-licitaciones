"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, FileText, Trophy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Proposal {
    id: string;
    provider_name: string;
    label: string;
    created_at: string;
    compliant_count: number | null;
    non_compliant_count: number | null;
    missing_info_count: number | null;
    unprocessable_count: number | null;
    compliance_score: number | null;
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

    const topId = proposals.reduce<string | null>((best, p) => {
        if (p.compliance_score == null) return best;
        if (best === null) return p.id;
        const bestScore = proposals.find((x) => x.id === best)?.compliance_score ?? -Infinity;
        return p.compliance_score > bestScore ? p.id : best;
    }, null);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold text-zinc-900">Propuestas ({proposals.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {proposals.map((proposal) => (
                    <Link key={proposal.id} href={`/analyses/${analysisId}/proposals/${proposal.id}`}>
                        <Card className={`hover:shadow-md transition-shadow h-full flex flex-col ${proposal.id === topId ? "border-emerald-400 shadow-emerald-100 shadow-md ring-1 ring-emerald-300" : ""}`}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-sm font-medium">
                                        {proposal.provider_name || "Proveedor sin nombre"}
                                    </CardTitle>
                                    {proposal.id === topId && (
                                        <span className="inline-flex flex-col items-center px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700 shrink-0 leading-tight gap-0.5">
                                            <Trophy className="w-4 h-4" />
                                            Mejor puntuación
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3 flex flex-col flex-1 justify-end">
                                <div>
                                    <div className="text-2xl font-bold">{proposal.label || "Sin etiqueta"}</div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {new Date(proposal.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                {(proposal.compliant_count != null || proposal.non_compliant_count != null) && (
                                    <div className="grid grid-cols-4 divide-x divide-zinc-100 border border-zinc-100 rounded-lg overflow-hidden bg-zinc-50 text-center">
                                        <div className="py-1.5 px-1">
                                            <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide leading-tight mb-0.5">Cumple</p>
                                            <p className="text-sm font-bold text-emerald-600">{proposal.compliant_count ?? "—"}</p>
                                        </div>
                                        <div className="py-1.5 px-1">
                                            <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide leading-tight mb-0.5">No cumple</p>
                                            <p className="text-sm font-bold text-red-500">{proposal.non_compliant_count ?? "—"}</p>
                                        </div>
                                        <div className="py-1.5 px-1">
                                            <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide leading-tight mb-0.5">Sin info</p>
                                            <p className="text-sm font-bold text-amber-500">{proposal.missing_info_count ?? "—"}</p>
                                        </div>
                                        <div className="py-1.5 px-1">
                                            <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide leading-tight mb-0.5">No procesado</p>
                                            <p className="text-sm font-bold text-zinc-400">{proposal.unprocessable_count ?? "—"}</p>
                                        </div>
                                    </div>
                                )}
                                {proposal.compliance_score != null && (
                                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border border-zinc-100 rounded-lg">
                                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Puntuación</span>
                                        <span className="text-base font-bold text-zinc-800">{proposal.compliance_score}/<span className="text-zinc-400 text-sm">100</span></span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}

