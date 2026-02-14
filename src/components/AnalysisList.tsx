"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed";
    is_success: boolean | null;
    created_at: string;
}

function getRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "hace unos segundos";
    if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} minutos`;
    if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} horas`;
    if (diffInSeconds < 604800) return `hace ${Math.floor(diffInSeconds / 86400)} días`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function AnalysisList() {
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
        ["pending", "processing"].includes(a.status)
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
                            <AnalysisCard key={analysis.slug} analysis={analysis} />
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
                            <AnalysisCard key={analysis.slug} analysis={analysis} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
    return (
        <Link
            href={`/analyses/${analysis.id}`}
            className="block bg-white rounded-xl border border-zinc-200 p-4 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="flex justify-between items-start mb-3">
                <span className="font-mono text-sm font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded uppercase">
                    {analysis.slug}
                </span>
                <StatusIcon status={analysis.status} isSuccess={analysis.is_success} />
            </div>

            <div className="space-y-1">
                <div className="flex items-center text-xs text-zinc-500">
                    <Clock className="w-3 h-3 mr-1" />
                    {getRelativeTime(analysis.created_at)}
                </div>
                <div className="text-xs font-medium">
                    <StatusBadge status={analysis.status} isSuccess={analysis.is_success} />
                </div>
            </div>
        </Link>
    );
}

function StatusIcon({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "processing") return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    if (status === "pending") return <Clock className="w-5 h-5 text-zinc-400" />;
    if (status === "ready") {
        return isSuccess ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
            <XCircle className="w-5 h-5 text-red-500" />
        );
    }
    return <AlertCircle className="w-5 h-5 text-gray-400" />;
}

function StatusBadge({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "processing") return <span className="text-blue-600">Procesando</span>;
    if (status === "pending") return <span className="text-zinc-500">Pendiente</span>;
    if (status === "ready") {
        return isSuccess ? (
            <span className="text-green-600">Completado</span>
        ) : (
            <span className="text-red-600">Fallido</span>
        );
    }
    return <span className="text-gray-500">Desconocido</span>;
}
