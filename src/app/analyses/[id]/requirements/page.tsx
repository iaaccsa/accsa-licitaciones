"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ClipboardList, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalysisRequirement {
    id: string;
    analysis_id: string;
    category: string;
    is_mandatory: boolean;
    created_at: string;
    requirement_code: string;
    page_reference: string;
    requirement_text: string;
    rag_chunk_id?: string;
}

const LIMIT = 20;

export default function RequirementsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [requirements, setRequirements] = useState<AnalysisRequirement[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);

    const observer = useRef<IntersectionObserver | null>(null);
    const lastRequirementElementRef = useCallback((node: HTMLTableRowElement) => {
        if (isLoadingInitial || isLoadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setOffset(prevOffset => prevOffset + LIMIT);
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoadingInitial, isLoadingMore, hasMore]);

    const fetchRequirements = useCallback(async (currentOffset: number, isInitial: boolean) => {
        try {
            if (isInitial) setIsLoadingInitial(true);
            else setIsLoadingMore(true);

            const response = await fetch(`/api/analyses/${id}/requirements`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: LIMIT, offset: currentOffset })
            });

            if (!response.ok) throw new Error("Error al cargar los requerimientos");

            const data = await response.json();
            const newRequirements = Array.isArray(data) ? data : [];

            setRequirements(prev => isInitial ? newRequirements : [...prev, ...newRequirements]);
            setHasMore(newRequirements.length === LIMIT);
        } catch (err) {
            console.error(err);
            setError("Error al cargar los datos");
        } finally {
            if (isInitial) setIsLoadingInitial(false);
            else setIsLoadingMore(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            // Initial fetch
            fetchRequirements(0, true);

            // Fetch analysis details
            fetch(`/api/analyses/${id}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) setAnalysis(data);
                })
                .catch(console.error);
        }
    }, [id, fetchRequirements]);

    useEffect(() => {
        if (offset > 0) {
            fetchRequirements(offset, false);
        }
    }, [offset, fetchRequirements]);

    if (error) {
        return (
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
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
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-green-600" />
                        Requerimientos
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {isLoadingInitial ? (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-3">
                            <div className="flex gap-4">
                                <Skeleton className="h-6 w-24 rounded" />
                                <Skeleton className="h-6 flex-1 rounded" />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Skeleton className="h-5 w-20 rounded-full" />
                                <Skeleton className="h-5 w-20 rounded-full" />
                                <Skeleton className="h-5 w-20 rounded-full" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {requirements.length > 0 ? (
                        requirements.map((req, index) => {
                            const isLastElement = requirements.length === index + 1;
                            return (
                                <div
                                    key={`${req.id}-${index}`}
                                    ref={isLastElement ? lastRequirementElementRef : null}
                                    className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                    {/* Top Row: Code and Description */}
                                    <div className="flex flex-col md:flex-row gap-3 md:gap-6 mb-4">
                                        <div className="min-w-[100px] pt-1">
                                            <span className="font-mono text-zinc-900 font-bold bg-zinc-100 px-2.5 py-1 rounded-md text-sm border border-zinc-200">
                                                {req.requirement_code}
                                            </span>
                                        </div>
                                        <div className="flex-1 prose prose-zinc prose-sm max-w-none">
                                            <p className="text-zinc-700 leading-relaxed font-normal">
                                                {req.requirement_text}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bottom Row: Tags */}
                                    <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-zinc-50 pl-0">
                                        {/* Category Tag */}
                                        {req.category && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wide">
                                                {req.category}
                                            </span>
                                        )}

                                        {/* Mandatory Tag */}
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${req.is_mandatory
                                            ? "bg-red-50 text-red-700 border-red-100"
                                            : "bg-zinc-50 text-zinc-600 border-zinc-200"
                                            }`}>
                                            {req.is_mandatory && <AlertCircle className="w-3.5 h-3.5" />}
                                            {req.is_mandatory ? "Mandatorio" : "Opcional"}
                                        </span>

                                        {/* Reference Tag */}
                                        {req.page_reference && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                                                <ClipboardList className="w-3.5 h-3.5 text-zinc-400" />
                                                Pg. {req.page_reference}
                                            </span>
                                        )}

                                        {/* RAG Chunk ID Tag */}
                                        {req.rag_chunk_id && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500 border border-zinc-200 font-mono ml-auto">
                                                rag-chunk-id: {req.rag_chunk_id}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-16 bg-white rounded-xl border border-zinc-200 border-dashed">
                            <div className="bg-zinc-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ClipboardList className="w-6 h-6 text-zinc-400" />
                            </div>
                            <p className="text-zinc-500 font-medium">No se encontraron requerimientos</p>
                            <p className="text-zinc-400 text-sm mt-1">Este análisis no tiene requerimientos asociados.</p>
                        </div>
                    )}
                </div>
            )}

            {isLoadingMore && (
                <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
            )}
        </div>
    );
}
