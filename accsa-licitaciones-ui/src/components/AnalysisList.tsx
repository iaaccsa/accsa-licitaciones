"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { AnalysisCard, type Analysis } from "./AnalysisCard";
import { Skeleton } from "./ui/skeleton";

const PAGE_SIZE = 15;

const controlClass =
    "h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

type SortOrder = "recent" | "oldest" | "name";

function displayName(analysis: Analysis) {
    return analysis.user_assigned_name || analysis.generated_name || analysis.slug;
}

function normalize(text: string) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

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
    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState<SortOrder>("recent");

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
                            <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <Skeleton className="h-5 w-28" />
                                    <Skeleton className="h-5 w-5 rounded-full" />
                                </div>
                                <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
                                    <Skeleton className="h-14 rounded-lg" />
                                    <Skeleton className="h-14 rounded-lg" />
                                    <Skeleton className="h-14 rounded-lg" />
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
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
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <p>{error}</p>
            </div>
        );
    }

    if (analyses.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <p>No hay análisis registrados aún.</p>
            </div>
        );
    }

    const query = normalize(search.trim());
    const filteredAnalyses = query
        ? analyses.filter((a) => normalize(displayName(a)).includes(query))
        : analyses;

    const sortedAnalyses = [...filteredAnalyses].sort((a, b) => {
        if (sortOrder === "name") {
            return displayName(a).localeCompare(displayName(b), "es", { sensitivity: "base" });
        }
        const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sortOrder === "oldest" ? diff : -diff;
    });

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
            {/* Search + sort */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Buscar por nombre..."
                        aria-label="Buscar análisis por nombre"
                        className={`${controlClass} w-full pl-9 placeholder:text-zinc-400 dark:placeholder:text-zinc-400`}
                    />
                </div>
                <select
                    value={sortOrder}
                    onChange={(e) => {
                        setSortOrder(e.target.value as SortOrder);
                        setPage(1);
                    }}
                    aria-label="Ordenar análisis"
                    className={controlClass}
                >
                    <option value="recent">Más recientes primero</option>
                    <option value="oldest">Más antiguos primero</option>
                    <option value="name">Nombre (A-Z)</option>
                </select>
            </div>

            {sortedAnalyses.length === 0 && (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                    <p>No hay análisis que coincidan con la búsqueda.</p>
                </div>
            )}

            {/* Active Analyses */}
            {activeAnalyses.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
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
                <div className="border-t border-zinc-200 dark:border-zinc-800" />
            )}

            {/* Completed Analyses */}
            {completedAnalyses.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
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
                                className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                            >
                                Anterior
                            </button>
                            {getPageNumbers(currentPage, totalPages).map((p, i) =>
                                p === "..." ? (
                                    <span key={`ellipsis-${i}`} className="px-2 text-sm text-zinc-400 dark:text-zinc-500">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p)}
                                        className={`min-w-9 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                            p === currentPage
                                                ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                            <button
                                onClick={() => setPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
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
