"use client";

import { useEffect, useState } from "react";
import { AnalysisCard, type Analysis } from "./AnalysisCard";
import { Skeleton } from "./ui/skeleton";

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
            <div className="space-y-8">
                <div>
                    <Skeleton className="h-4 w-20 mb-4" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <Skeleton className="h-5 w-28" />
                                    <Skeleton className="h-5 w-5 rounded-full" />
                                </div>
                                <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
                                    <Skeleton className="h-14 rounded-lg" />
                                    <Skeleton className="h-14 rounded-lg" />
                                    <Skeleton className="h-14 rounded-lg" />
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                                    <Skeleton className="h-3 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {completedAnalyses.map((analysis) => (
                            <AnalysisCard key={analysis.slug} analysis={analysis} basePath={basePath} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
