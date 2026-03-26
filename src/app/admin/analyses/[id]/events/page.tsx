"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ChevronLeft, Cpu, ChevronDown, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalysisEvent {
    id: string;
    level: string;
    source: string;
    message: string;
    created_at: string;
    details?: Record<string, unknown>;
}

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
    });
}

export default function AnalysisEventsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [events, setEvents] = useState<AnalysisEvent[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const LIMIT = 20; // Increased limit for full page view

    const fetchEvents = useCallback(async (currentOffset: number, isInitial = false) => {
        if (isInitial) setIsLoading(true);
        else setIsLoadingMore(true);

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
                if (isInitial) setError("Error al cargar los eventos");
            }
        } catch (err) {
            console.error("Error fetching events:", err);
            setHasMore(false);
            if (isInitial) setError("Error al cargar los eventos");
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [id]);

    useEffect(() => {
        const fetchAnalysis = async () => {
            try {
                const res = await fetch(`/api/analyses/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setAnalysis(data);
                }
            } catch (err) {
                console.error("Error fetching analysis:", err);
            }
        };

        if (id) {
            fetchEvents(0, true);
            fetchAnalysis();
        }
    }, [id, fetchEvents]);

    if (error) {
        return (
            <div className="max-w-5xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
                <p className="text-zinc-600">{error}</p>
                <button
                    onClick={() => router.back()}
                    className="mt-4 text-blue-600 hover:underline"
                >
                    Volver al análisis
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <Cpu className="w-6 h-6 text-purple-600" />
                        Historial de Eventos
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                {isLoading ? (
                    <div className="space-y-8 pl-6 border-l-2 border-zinc-100">
                        {[1, 2, 3, 4, 5].map(i => (
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
                ) : events.length > 0 ? (
                    <>
                        <div className="relative pl-6 border-l-2 border-zinc-100 space-y-8">
                            {events.map((event) => (
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
                                    <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                                        {event.message}
                                    </p>
                                    {event.details && Object.keys(event.details).length > 0 && (
                                        <pre className="mt-2 text-xs bg-zinc-50 p-2 rounded border border-zinc-100 overflow-x-auto text-zinc-500 font-mono">
                                            {JSON.stringify(event.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>

                        {hasMore && (
                            <div className="mt-8 pt-4 flex justify-center border-t border-zinc-100">
                                <button
                                    onClick={() => {
                                        const nextOffset = offset + LIMIT;
                                        setOffset(nextOffset);
                                        fetchEvents(nextOffset);
                                    }}
                                    disabled={isLoadingMore}
                                    className="px-4 py-2 bg-white border border-zinc-200 shadow-sm rounded-lg text-sm text-zinc-600 hover:text-blue-600 hover:border-blue-200 font-medium disabled:opacity-50 transition-all flex items-center gap-2"
                                >
                                    {isLoadingMore ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4" />
                                    )}
                                    {isLoadingMore ? "Cargando..." : "Cargar más eventos"}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12">
                        <p className="text-zinc-400 italic">No hay eventos registrados para este análisis.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
