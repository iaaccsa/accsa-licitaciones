"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2, AlertCircle, FileText } from "lucide-react";
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
    result: {
        points: Chunk[];
        next_page_offset: string | null;
    };
    status: string;
    time: number;
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
            const payload = {
                slug: analysis.slug,
                category: file.category,
                label: file.proposal_label || "tender",
                offset: currentOffset
            };

            const res = await fetch(`/api/analyses/${id}/files/${fileId}/chunks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data: ChunkResponse[] = await res.json();
                if (data && data.length > 0) {
                    const result = data[0].result;
                    setChunks(prev => currentOffset === "" ? result.points : [...prev, ...result.points]);
                    setOffset(result.next_page_offset);
                }
            }
        } catch (err) {
            console.error("Error loading chunks:", err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [analysis, file, id, fileId]);

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
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                            Chunks del Archivo
                        </h1>
                        {file && (
                            <p className="text-zinc-500 text-sm mt-1">{file.file_name} ({formatBytes(file.file_size)})</p>
                        )}
                    </div>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase self-start md:self-center">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {/* File Details Box */}
            {file && (
                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Detalles del Archivo
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8 text-sm">

                        {/* Column 1: Basic Info */}
                        <div className="space-y-2">
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Nombre del Archivo</span>
                                <span className="text-zinc-900 font-medium break-all">{file.file_name}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">ID del Archivo</span>
                                <span className="font-mono text-zinc-700 text-xs">{file.id}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Ruta de Almacenamiento</span>
                                <span className="font-mono text-zinc-600 text-xs break-all">{file.storage_path}</span>
                            </div>
                        </div>

                        {/* Column 2: Metadata */}
                        <div className="space-y-2">
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Categoría</span>
                                <span className="capitalize text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded inline-block mt-0.5">{file.category}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Tipo MIME</span>
                                <span className="font-mono text-zinc-600 text-xs">{file.mime_type}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Tamaño</span>
                                <span className="text-zinc-900">{formatBytes(file.file_size)}</span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Fecha de Creación</span>
                                <span className="text-zinc-900">{new Date(file.created_at).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Column 3: Processing Info */}
                        <div className="space-y-2">
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Versión Procesada</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${file.is_processed_version ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-600'}`}>
                                    {file.is_processed_version ? "Sí" : "No"}
                                </span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Fusionado (Merged)</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${file.is_merged ? 'bg-purple-100 text-purple-700' : 'bg-zinc-100 text-zinc-600'}`}>
                                    {file.is_merged ? "Sí" : "No"}
                                </span>
                            </div>
                            <div>
                                <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Total Chunks</span>
                                <span className="font-mono text-zinc-900">{file.total_chunks || 0}</span>
                            </div>
                            {file.proposal_id && (
                                <div>
                                    <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">ID de Propuesta</span>
                                    <span className="font-mono text-zinc-600 text-xs">{file.proposal_id}</span>
                                </div>
                            )}
                            {(file.proposal_label || file.proposal_provider_name) && (
                                <div className="mt-1 pt-1 border-t border-zinc-100">
                                    <span className="text-zinc-500 block text-xs uppercase tracking-wider font-semibold">Oferta</span>
                                    <div className="flex flex-col">
                                        {file.proposal_provider_name && <span className="text-zinc-900 font-medium">{file.proposal_provider_name}</span>}
                                        {file.proposal_label && <span className="text-zinc-500 text-xs italic">{file.proposal_label}</span>}
                                    </div>
                                </div>
                            )}
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
                    {chunks.map(chunk => (
                        <div key={chunk.id} className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm hover:border-blue-300 transition-colors">
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
                    ))}

                    {chunks.length === 0 && !isLoading && (
                        <div className="text-center py-12 text-zinc-500">
                            No hay chunks disponibles para este archivo.
                        </div>
                    )}

                    {offset && (
                        <div className="flex justify-center pt-6">
                            <button
                                onClick={() => loadChunks(offset)}
                                disabled={isLoadingMore}
                                className="px-6 py-2 bg-white border border-zinc-200 shadow-sm rounded-lg text-sm text-zinc-600 hover:text-blue-600 hover:border-blue-200 font-medium disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isLoadingMore ? "Cargando..." : "Cargar más chunks"}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
