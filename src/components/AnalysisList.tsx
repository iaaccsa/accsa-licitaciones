"use client";

import { useEffect, useState } from "react";
import { AnalysisCard, type Analysis } from "./AnalysisCard";
import { Skeleton } from "./ui/skeleton";

const PAGE_SIZE = 15;

function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
}

export function AnalysisList({ basePath = "/analyses", scope }: { basePath?: string; scope?: "all" } = {}) {
    const [analyses, setAnalyses] = useState<Analysis[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const fetchAnalyses = async () => {
            try {
                const response = await fetch(`/api/analyses/list${scope === "all" ? "?scope=all" : ""}`);
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
    }, [scope]);

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

    const totalPages = Math.ceil(completedAnalyses.length / PAGE_SIZE);
    const currentPage = Math.min(page, Math.max(totalPages, 1));
    const pagedCompleted = completedAnalyses.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
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
                        {pagedCompleted.map((analysis) => (
                            <AnalysisCard key={analysis.slug} analysis={analysis} basePath={basePath} />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-1 mt-6">
                            <button
                                onClick={() => setPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                            >
                                Anterior
                            </button>
                            {getPageNumbers(currentPage, totalPages).map((p, i) =>
                                p === "..." ? (
                                    <span key={`ellipsis-${i}`} className="px-2 text-sm text-zinc-400">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p)}
                                        className={`min-w-9 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                            p === currentPage
                                                ? "bg-blue-50 text-blue-700"
                                                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                            <button
                                onClick={() => setPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
