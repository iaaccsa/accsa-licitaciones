"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Cpu, ExternalLink, FileText, ClipboardList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed";
    is_success: boolean | null;
    created_at: string;
    updated_at: string;
}

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
    });
}

export default function AnalysisDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const analysisRes = await fetch(`/api/analyses/${id}`);

                if (!analysisRes.ok) throw new Error("Error fetching analysis details");
                const analysisData = await analysisRes.json();
                setAnalysis(analysisData);

            } catch (err) {
                console.error(err);
                setError("No se pudo cargar la información del análisis.");
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchData();
        }
    }, [id]);

    if (error) {
        return (
            <div className="max-w-5xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
                <p className="text-zinc-600">{error}</p>
            </div>
        );
    }

    if (isLoading) {
        return <AnalysisDetailSkeleton />;
    }

    if (!analysis) return null;

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
                <div className="flex flex-col gap-2 mb-6">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-2xl font-bold font-mono text-zinc-900 uppercase">
                            {analysis.slug}
                        </h1>
                        <StatusBadge status={analysis.status} isSuccess={analysis.is_success} />
                    </div>
                    <div className="flex items-center justify-between text-sm text-zinc-500 gap-4">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(analysis.created_at)}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-xs bg-zinc-100 px-2 py-0.5 rounded">
                            ID: {analysis.id}
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation Buttons */}
            <div className="grid md:grid-cols-2 gap-6">
                <a
                    href={`/analyses/${id}/files`}
                    className="flex items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
                >
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <FileText className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors">
                            Archivos
                        </h3>
                        <p className="text-sm text-zinc-500">
                            Ver pliegos, normativas y ofertas
                        </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-zinc-300 group-hover:text-blue-600 transition-colors" />
                </a>

                <a
                    href={`/analyses/${id}/requirements`}
                    className="flex items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-green-300 hover:shadow-md transition-all group"
                >
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
                        <ClipboardList className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-green-600 transition-colors">
                            Requerimientos
                        </h3>
                        <p className="text-sm text-zinc-500">
                            Ver matriz de cumplimiento
                        </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-zinc-300 group-hover:text-green-600 transition-colors" />
                </a>

                <a
                    href={`/analyses/${id}/events`}
                    className="flex items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group"
                >
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <Cpu className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-purple-600 transition-colors">
                            Historial de Eventos
                        </h3>
                        <p className="text-sm text-zinc-500">
                            Ver bitácora de ejecución
                        </p>
                    </div>
                    <ExternalLink className="w-5 h-5 text-zinc-300 group-hover:text-purple-600 transition-colors" />
                </a>
            </div>
        </div>
    );
}

function AnalysisDetailSkeleton() {
    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
            {/* Header Skeleton */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-3 w-full">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-32" />
                            <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
                        <div className="flex gap-4">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-4 w-60" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Files Grid Skeleton */}
            <div className="grid md:grid-cols-2 gap-6">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>


        </div>
    );
}

function StatusBadge({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "processing") return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Procesando
        </span>
    );
    if (status === "pending") return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pendiente
        </span>
    );
    if (status === "ready") {
        return isSuccess ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Completado
            </span>
        ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Fallido
            </span>
        );
    }
    return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Desconocido
        </span>
    );
}
