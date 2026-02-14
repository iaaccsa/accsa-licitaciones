"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, FileText, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Cpu, Download, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Analysis {
    id: string;
    slug: string;
    status: "pending" | "processing" | "ready" | "failed";
    is_success: boolean | null;
    created_at: string;
    updated_at: string;
}

interface AnalysisFile {
    id: string;
    file_name: string;
    category: "tender" | "proposal";
    file_size: number;
    mime_type: string;
    storage_path: string;
    created_at: string;
}

interface AnalysisEvent {
    id: string;
    level: string;
    source: string;
    message: string;
    created_at: string;
    details?: any;
}

// ... existing code ...

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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
    const [files, setFiles] = useState<AnalysisFile[]>([]);
    const [events, setEvents] = useState<AnalysisEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const LIMIT = 10;

    const fetchEvents = useCallback(async (currentOffset: number) => {
        setIsLoadingEvents(true);
        try {
            const res = await fetch(`/api/analyses/${id}/events`, {
                method: "POST",
                body: JSON.stringify({ limit: LIMIT, offset: currentOffset })
            });
            if (res.ok) {
                const newEvents: AnalysisEvent[] = await res.json();
                const list = Array.isArray(newEvents) ? newEvents : [];

                if (list.length < LIMIT) {
                    setHasMore(false);
                }

                setEvents(prev => currentOffset === 0 ? list : [...prev, ...list]);
            } else {
                setHasMore(false);
            }
        } catch (err) {
            console.error("Error fetching events:", err);
            setHasMore(false);
        } finally {
            setIsLoadingEvents(false);
        }
    }, [id]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch Analysis Details
                const analysisRes = await fetch(`/api/analyses/${id}`);
                if (!analysisRes.ok) throw new Error("Error fetching analysis details");
                const analysisData = await analysisRes.json();
                setAnalysis(analysisData);

                // Fetch Files
                const filesRes = await fetch(`/api/analyses/${id}/files`, { method: "POST" });
                if (filesRes.ok) {
                    const filesData = await filesRes.json();
                    setFiles(Array.isArray(filesData) ? filesData : []);
                }

                // Fetch Events
                // Fetch Events (Initial)
                await fetchEvents(0);

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
    }, [id, fetchEvents]);

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

    const tenderFiles = files.filter(f => f.category === 'tender');
    const proposalFiles = files.filter(f => f.category === 'proposal');

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold font-mono text-zinc-900 uppercase">
                                {analysis.slug}
                            </h1>
                            <StatusBadge status={analysis.status} isSuccess={analysis.is_success} />
                        </div>
                        <div className="flex items-center text-sm text-zinc-500 gap-4">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(analysis.created_at)}
                            </span>
                            <span className="flex items-center gap-1 font-mono text-xs bg-zinc-100 px-2 py-0.5 rounded">
                                ID: {analysis.id}
                            </span>
                        </div>
                    </div>
                    {/* Actions or additional info could go here */}
                </div>
            </div>

            {/* Files Section */}
            <div className="space-y-6">
                {/* Tender Files */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Pliego y Normativas
                    </h2>
                    {tenderFiles.length > 0 ? (
                        <ul className="space-y-3">
                            {tenderFiles.map(file => (
                                <li key={file.id} className="flex items-center justify-between text-sm p-3 bg-zinc-50 rounded-lg border border-zinc-100 group hover:border-blue-200 transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
                                        <span className="truncate font-medium text-zinc-700">{file.file_name}</span>
                                        <span className="text-zinc-400 text-xs whitespace-nowrap font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                                            {formatBytes(file.file_size)}
                                        </span>
                                    </div>
                                    <button
                                        className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                        title="Descargar documento"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-zinc-400 italic">No hay archivos de pliego.</p>
                    )}
                </div>

                {/* Proposal Files */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-green-600" />
                        Ofertas
                    </h2>
                    {proposalFiles.length > 0 ? (
                        <ul className="space-y-3">
                            {proposalFiles.map(file => (
                                <li key={file.id} className="flex items-center justify-between text-sm p-3 bg-zinc-50 rounded-lg border border-zinc-100 group hover:border-blue-200 transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
                                        <span className="truncate font-medium text-zinc-700">{file.file_name}</span>
                                        <span className="text-zinc-400 text-xs whitespace-nowrap font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                                            {formatBytes(file.file_size)}
                                        </span>
                                    </div>
                                    <button
                                        className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                        title="Descargar documento"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-zinc-400 italic">No hay archivos de oferta.</p>
                    )}
                </div>
            </div>

            {/* Events Section */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-800 mb-6 flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-purple-600" />
                    Historial de Eventos
                </h2>

                {events.length > 0 ? (
                    <>
                        <div className="relative pl-6 border-l-2 border-zinc-100 space-y-8">
                            {events.map((event, index) => (
                                <div key={event.id} className="relative">
                                    {/* Dot */}
                                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-500"></div>

                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-1">
                                        <span className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">
                                            {(event.source || 'evento_desconocido').replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs text-zinc-400 font-mono">
                                            {formatDate(event.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-600 leading-relaxed">
                                        {event.message}
                                    </p>
                                    {event.details && Object.keys(event.details).length > 0 && (
                                        <pre className="mt-2 text-xs bg-zinc-50 p-2 rounded border border-zinc-100 overflow-x-auto text-zinc-500">
                                            {JSON.stringify(event.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>

                        {hasMore && (
                            <div className="pl-6 border-l-2 border-zinc-100 mt-4">
                                <button
                                    onClick={() => {
                                        const nextOffset = offset + LIMIT;
                                        setOffset(nextOffset);
                                        fetchEvents(nextOffset);
                                    }}
                                    disabled={isLoadingEvents}
                                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
                                >
                                    {isLoadingEvents ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4" />
                                    )}
                                    {isLoadingEvents ? "Cargando..." : "Cargar más eventos"}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-zinc-400 italic">No hay eventos registrados.</p>
                )}
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

            {/* Events Skeleton */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-6">
                <Skeleton className="h-6 w-48 mb-6" />
                <div className="pl-6 border-l-2 border-zinc-100 space-y-8">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="relative space-y-2">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    ))}
                </div>
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
