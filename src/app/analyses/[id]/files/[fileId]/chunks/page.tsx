"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2, AlertCircle, FileText, CheckCircle, GitMerge, Box, Hash, Copy, Calendar, Database, Key } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Chunk {
    id: string;
    payload: {
        text: string;
        file_id: string;
        analysis_id: string;
        category: string;
        label: string;
        proposal_id: string;
        proposal_provider_name: string | null;
        filename: string;
        [key: string]: string | null; // For dynamic headers (Header 1, Header 2, etc.)
    };
}

interface ChunkResponse {
    points: Chunk[];
    next_page_offset: string | null;
}

interface AnalysisFile {
    id: string;
    file_name: string;
    category: "tender" | "proposal";
    file_size: number;
    mime_type: string;
    storage_path: string;
    created_at: string;
    proposal_label?: string;
    proposal_provider_name?: string;
    is_processed_version?: boolean;
    total_chunks?: number;
    analysis_id: string;
    proposal_id?: string;
    is_merged?: boolean;
}

interface ChunksPayload {
    slug: string;
    category: string;
    label: string;
    offset?: string;
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function ChunksPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const fileId = params.fileId as string;

    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [file, setFile] = useState<AnalysisFile | null>(null);
    const [chunks, setChunks] = useState<Chunk[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [offset, setOffset] = useState<string | null>("");
    const [error, setError] = useState<string | null>(null);

    // Initial data fetch (Analysis + File Info)
    useEffect(() => {
        const fetchMetadata = async () => {
            setIsLoading(true);
            try {
                const [filesRes, analysisRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/files`, { method: "POST" }),
                    fetch(`/api/analyses/${id}`)
                ]);

                if (filesRes.ok) {
                    const filesData = await filesRes.json();
                    if (Array.isArray(filesData)) {
                        const currentFile = filesData.find((f: AnalysisFile) => f.id === fileId);
                        if (currentFile) {
                            setFile(currentFile);
                        } else {
                            setError("Archivo no encontrado");
                        }
                    }
                } else {
                    throw new Error("Error loading files");
                }

                if (analysisRes.ok) {
                    const analysisData = await analysisRes.json();
                    setAnalysis(analysisData);
                }
            } catch (err) {
                console.error(err);
                setError("Error al cargar los datos");
            } finally {
                setIsLoading(false);
            }
        };

        if (id && fileId) {
            fetchMetadata();
        }
    }, [id, fileId]);

    const loadChunks = useCallback(async (currentOffset: string) => {
        if (!analysis || !file) return;

        setIsLoadingMore(true);
        try {
            const payload: ChunksPayload = {
                slug: analysis.slug,
                category: file.category,
                label: file.proposal_label || "tender",
            };

            if (currentOffset) {
                payload.offset = currentOffset;
            }

            const res = await fetch(`/api/analyses/${id}/files/${fileId}/chunks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data: ChunkResponse = await res.json();
                if (data && data.points) {
                    setChunks(prev => currentOffset === "" ? data.points : [...prev, ...data.points]);
                    setOffset(data.next_page_offset);
                }
            }
        } catch (err) {
            console.error("Error loading chunks:", err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [analysis, file, id, fileId]);

    const observer = useRef<IntersectionObserver | null>(null);
    const lastChunkElementRef = useCallback((node: HTMLDivElement) => {
        if (isLoadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && offset) {
                loadChunks(offset);
            }
        });
        if (node) observer.current.observe(node);
    }, [isLoadingMore, offset, loadChunks]);

    useEffect(() => {
        if (analysis && file && chunks.length === 0) {
            loadChunks("");
        }
    }, [analysis, file, chunks.length, loadChunks]);

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
                    Volver
                </button>
            </div>
        );
    }


    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            {/* Top Navigation Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Chunks del archivo <span className="text-blue-600">{file?.file_name}</span>
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {/* File Details Cards */}
            {file && (
                <div className="space-y-6">
                    {/* Card 1: Main Info & Metrics */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-50 rounded-lg">
                                <FileText className="w-8 h-8 text-blue-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-xl font-bold text-zinc-900">{file.file_name}</h1>
                                    <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                        {file.category}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                                    <span className="flex items-center gap-1">
                                        <Database className="w-4 h-4" />
                                        {formatBytes(file.file_size)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <FileText className="w-4 h-4" />
                                        {file.mime_type}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(file.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 bg-zinc-50 rounded-lg p-2 border border-zinc-100 self-start md:self-center">
                            <div className="px-4 py-2 border-r border-zinc-200 text-center">
                                <span className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">PROCESSED</span>
                                <span className={`flex items-center justify-center gap-1 font-medium ${file.is_processed_version ? 'text-green-600' : 'text-zinc-500'}`}>
                                    {file.is_processed_version ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    {file.is_processed_version ? 'Yes' : 'No'}
                                </span>
                            </div>
                            <div className="px-4 py-2 border-r border-zinc-200 text-center">
                                <span className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">MERGED</span>
                                <span className={`flex items-center justify-center gap-1 font-medium ${file.is_merged ? 'text-purple-600' : 'text-zinc-500'}`}>
                                    {file.is_merged ? <GitMerge className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    {file.is_merged ? 'Yes' : 'No'}
                                </span>
                            </div>
                            <div className="px-4 py-2 text-center min-w-[80px]">
                                <span className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">CHUNKS</span>
                                <span className="text-lg font-bold text-zinc-900">{file.total_chunks || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Card 2: Context */}
                        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Box className="w-4 h-4" />
                                Contexto de Negocio
                            </h2>

                            <div className="space-y-6">
                                <div>
                                    <span className="text-zinc-500 text-sm block mb-1">Oferta Vinculada</span>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold ring-2 ring-indigo-100">
                                            {file.proposal_provider_name ? file.proposal_provider_name.substring(0, 2).toUpperCase() : 'NA'}
                                        </div>
                                        <div>
                                            <div className="font-medium text-zinc-900">
                                                {file.proposal_provider_name || 'N/A'}
                                            </div>
                                            {(file.proposal_label) && (
                                                <div className="text-xs text-zinc-500 font-mono mt-0.5">
                                                    ref: {file.proposal_label}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-zinc-500 text-sm block mb-1">Proposal ID</span>
                                    <div className="bg-zinc-50 border border-zinc-200 rounded-md p-2 flex items-center justify-between group">
                                        <code className="text-xs text-zinc-600 truncate max-w-[200px]">
                                            {file.proposal_id || 'N/A'}
                                        </code>
                                        {file.proposal_id && (
                                            <button
                                                onClick={() => navigator.clipboard.writeText(file.proposal_id!)}
                                                className="p-1 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Copy ID"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: System Metadata */}
                        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Hash className="w-4 h-4" />
                                Metadatos de Sistema
                            </h2>

                            <div className="space-y-6">
                                <div>
                                    <span className="text-zinc-500 text-sm block mb-2">Ruta de Almacenamiento (Storage Path)</span>
                                    <div className="bg-zinc-900 rounded-lg p-3 font-mono text-xs text-zinc-100 overflow-x-auto">
                                        {file.storage_path}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-zinc-500 text-sm block mb-2">System File ID</span>
                                    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex items-center gap-3 group">
                                        <div className="p-1.5 bg-zinc-200 rounded text-zinc-500">
                                            <Key className="w-4 h-4" />
                                        </div>
                                        <code className="text-sm text-zinc-700 font-mono flex-1">
                                            {file.id}
                                        </code>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(file.id)}
                                            className="p-2 hover:bg-zinc-200 rounded-md text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Copy ID"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8 pt-2">
                                    <div>
                                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">CREADO</span>
                                        <div className="text-zinc-900 font-medium">
                                            {new Date(file.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">PROCESADO</span>
                                        {/* Assuming same as created for now, or add processed_at if available */}
                                        <div className="text-zinc-900 font-medium">
                                            {new Date(file.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            {isLoading && chunks.length === 0 ? (
                <div className="space-y-4">
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                </div>
            ) : (
                <div className="space-y-4">
                    {chunks.map((chunk, index) => {
                        const isLast = chunks.length === index + 1;
                        return (
                            <div
                                key={chunk.id}
                                ref={isLast ? lastChunkElementRef : undefined}
                                className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm hover:border-blue-300 transition-colors relative"
                            >
                                <div className="absolute top-4 right-4 bg-blue-100 text-blue-700 text-xs font-mono px-2 py-1 rounded">
                                    #{index + 1}
                                </div>
                                {/* Dynamic Headers */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {Object.keys(chunk.payload)
                                        .filter(key => key.startsWith("Header"))
                                        .sort()
                                        .map(key => (
                                            <span key={key} className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2 py-1 rounded">
                                                {chunk.payload[key]}
                                            </span>
                                        ))}
                                </div>
                                <p className="text-zinc-700 text-sm whitespace-pre-wrap leading-relaxed">
                                    {chunk.payload.text}
                                </p>
                                <div className="mt-4 pt-4 border-t border-zinc-100 text-xs text-zinc-400 font-mono flex justify-between">
                                    <span>ID: {chunk.id}</span>
                                    <span>Page: {chunk.payload.page || 'N/A'}</span>
                                </div>
                            </div>
                        );
                    })}

                    {chunks.length === 0 && !isLoading && (
                        <div className="text-center py-12 text-zinc-500">
                            No hay chunks disponibles para este archivo.
                        </div>
                    )}

                    {isLoadingMore && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
