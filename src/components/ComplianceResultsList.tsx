"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, FileText, MinusCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ComplianceResult {
    id: string;
    requirement_code: string;
    requirement_text: string;
    status: "compliant" | "non_compliant" | "missing_info" | string;
    evidence_quote: string | null;
    reasoning: string | null;
    suggestion: string | null;
}

interface ComplianceResultsListProps {
    analysisId: string;
    proposalId: string;
}

function ComplianceStatusBadge({ status }: { status: string }) {
    if (status === "compliant" || status === "met") {
        return (
            <Badge variant="default" className="border-emerald-400 text-emerald-400 bg-emerald-50">
                <CheckCircle className="w-3 h-3 mr-1" />
                Cumple
            </Badge>
        );
    }
    if (status === "non_compliant" || status === "not_met") {
        return (
            <Badge variant="destructive" className="border-red-400 text-red-400 bg-red-50">
                <XCircle className="w-3 h-3 mr-1" />
                No Cumple
            </Badge>
        );
    }
    if (status === "missing_info" || status === "pending") {
        return (
            <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">
                <AlertCircle className="w-3 h-3 mr-1" />
                Info Faltante
            </Badge>
        );
    }

    return (
        <Badge variant="secondary">
            <MinusCircle className="w-3 h-3 mr-1" />
            {status}
        </Badge>
    );
}

export default function ComplianceResultsList({ analysisId, proposalId }: ComplianceResultsListProps) {
    const [results, setResults] = useState<ComplianceResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchResults = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/analyses/${analysisId}/proposals/${proposalId}/compliance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ offset: 0, limit: 20 }) // Initial fetch
                });

                if (!response.ok) {
                    throw new Error("Error fetching compliance results");
                }
                const data = await response.json();

                // Handle potential array or enveloped response
                const list = Array.isArray(data) ? data : (data.results || []);
                setResults(list);

            } catch (err) {
                console.error(err);
                setError("No se pudieron cargar los resultados de cumplimiento.");
            } finally {
                setIsLoading(false);
            }
        };

        if (proposalId) {
            fetchResults();
        }
    }, [analysisId, proposalId]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between">
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="h-5 w-20" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-20 w-full bg-zinc-50" />
                        </CardContent>
                    </Card>
                ))}
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

    if (results.length === 0) {
        return (
            <div className="p-8 text-center bg-zinc-50 rounded-xl border border-zinc-200 border-dashed">
                <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-500">No hay resultados de cumplimiento disponibles.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold text-zinc-900">Resultados de Cumplimiento ({results.length})</h2>
            <div className="space-y-4">
                {results.map((result, index) => (
                    <Card key={result.id || index} className="overflow-hidden gap-0">
                        <CardHeader className="bg-zinc-50/50 py-3 border-b border-zinc-100">
                            <div className="flex items-center justify-between">
                                <Badge variant="outline" className="font-mono text-xs shadow-none bg-white">
                                    {result.requirement_code}
                                </Badge>
                                <ComplianceStatusBadge status={result.status} />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                    Requisito
                                </span>
                                <div className="text-sm text-zinc-800 bg-white border border-zinc-200 rounded-md p-3 shadow-sm">
                                    {result.requirement_text || "Requisito sin descripción"}
                                </div>
                            </div>

                            {result.evidence_quote && (
                                <div className="space-y-2">
                                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Evidencia
                                    </span>
                                    <div className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-md p-3 italic">
                                        &quot;{result.evidence_quote}&quot;
                                    </div>
                                </div>
                            )}

                            {result.reasoning && (
                                <div className="space-y-2">
                                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Análisis
                                    </span>
                                    <div className="text-sm text-zinc-700 bg-blue-50/50 border border-blue-100 rounded-md p-3">
                                        {result.reasoning}
                                    </div>
                                </div>
                            )}

                            {!result.evidence_quote && !result.reasoning && (
                                <div className="text-sm text-zinc-400 italic pt-2">
                                    No se encontró evidencia específica en el documento.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
