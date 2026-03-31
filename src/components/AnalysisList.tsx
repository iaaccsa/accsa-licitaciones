"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AnalysisCard, type Analysis } from "./AnalysisCard";

export function AnalysisList({ basePath = "/analyses" }: { basePath?: string } = {}) {
    const [analyses, setAnalyses] = useState<Analysis[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAnalyses = async () => {
            try {
                const response = await fetch("/api/analyses/list");
                if (response.ok) {
                    const data = await response.json();
                    setAnalyses(data);
                } else {
                    setError("No se pudieron cargar los análisis");
                }
            } catch (error) {
                console.error(error);
                setError("Ocurrió un error al cargar los datos");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalyses();
    }, []);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12 text-zinc-500">
                <p>{error}</p>
            </div>
        );
    }

    if (analyses.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-500">
                <p>No hay análisis registrados aún.</p>
            </div>
        );
    }

    // Sort by date descending
    const sortedAnalyses = [...analyses].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const activeAnalyses = sortedAnalyses.filter((a) =>
        ["pending", "processing", "awaiting_approval"].includes(a.status)
    );
    const completedAnalyses = sortedAnalyses.filter((a) =>
        ["ready", "failed"].includes(a.status)
    );

    return (
        <div className="space-y-8">
            {/* Active Analyses */}
            {activeAnalyses.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                        En Curso
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {activeAnalyses.map((analysis) => (
                            <AnalysisCard key={analysis.slug} analysis={analysis} basePath={basePath} />
                        ))}
                    </div>
                </div>
            )}

            {/* Visual Divider if both sections exist */}
            {activeAnalyses.length > 0 && completedAnalyses.length > 0 && (
                <div className="border-t border-zinc-200" />
            )}

            {/* Completed Analyses */}
            {completedAnalyses.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                        Completados
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {completedAnalyses.map((analysis) => (
                            <AnalysisCard key={analysis.slug} analysis={analysis} basePath={basePath} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
