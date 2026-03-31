"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Download, Eye, ChevronLeft, AlertCircle, MessageSquare, HelpCircle, ArrowRightLeft, X, Loader2, Ban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface AnalysisFile {
    id: string;
    file_name: string;
    category: "tender" | "proposal" | "unclassified";
    file_size: number;
    mime_type: string;
    storage_path: string;
    created_at: string;
    proposal_label?: string;
    proposal_provider_name?: string;
    is_processed_version?: boolean;
    is_reorderable?: boolean;
    total_chunks?: number;
    analysis_id: string;
    proposal_id?: string;
    tender_id?: string;
    is_merged?: boolean;
}

interface Source {
    type: "proposal" | "tender";
    id: string;
    label: string;
}

const SUPABASE_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL;

const STORAGE_PATH_REGEX = /^[a-zA-Z0-9/_\-][a-zA-Z0-9/_\-.]*$/;

function isValidStoragePath(path: string): boolean {
    if (!path || path.length > 500) return false;
    if (path.includes("..") || path.includes("//")) return false;
    return STORAGE_PATH_REGEX.test(path);
}

function getDownloadUrl(file: { storage_path: string; file_name: string }): string | null {
    if (!SUPABASE_STORAGE_URL || !isValidStoragePath(file.storage_path)) return null;
    return `${SUPABASE_STORAGE_URL}/${file.storage_path}?download=${encodeURIComponent(file.file_name)}`;
}

function getViewUrl(file: { storage_path: string }): string | null {
    if (!SUPABASE_STORAGE_URL || !isValidStoragePath(file.storage_path)) return null;
    return `${SUPABASE_STORAGE_URL}/${file.storage_path}`;
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function AnalysisFilesPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [files, setFiles] = useState<AnalysisFile[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [moveFile, setMoveFile] = useState<AnalysisFile | null>(null);
    const [sources, setSources] = useState<Source[]>([]);
    const [isLoadingSources, setIsLoadingSources] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [selectedSource, setSelectedSource] = useState<Source | null>(null);
    const [excludingFileId, setExcludingFileId] = useState<string | null>(null);

    const openMoveModal = useCallback(async (file: AnalysisFile) => {
        setMoveFile(file);
        setSelectedSource(null);
        setIsLoadingSources(true);
        try {
            const res = await fetch(`/api/analyses/${id}/sources`);
            if (res.ok) {
                const data = await res.json();
                setSources(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Error fetching sources:", err);
        } finally {
            setIsLoadingSources(false);
        }
    }, [id]);

    const refreshFiles = useCallback(async () => {
        const filesRes = await fetch(`/api/analyses/${id}/files`, { method: "POST" });
        if (filesRes.ok) {
            const data = await filesRes.json();
            setFiles(Array.isArray(data) ? data : []);
        }
    }, [id]);

    const handleMove = useCallback(async () => {
        if (!moveFile || !selectedSource || isMoving) return;
        setIsMoving(true);
        try {
            const body = selectedSource.type === "proposal"
                ? { proposal_id: selectedSource.id }
                : { tender_id: selectedSource.id };

            const res = await fetch(`/api/files/${moveFile.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                await refreshFiles();
                setMoveFile(null);
            }
        } catch (err) {
            console.error("Error moving file:", err);
        } finally {
            setIsMoving(false);
        }
    }, [moveFile, selectedSource, isMoving, refreshFiles]);

    const handleExclude = useCallback(async (file: AnalysisFile) => {
        if (excludingFileId) return;
        setExcludingFileId(file.id);
        try {
            const res = await fetch(`/api/files/${file.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category: "unclassified" }),
            });
            if (res.ok) {
                await refreshFiles();
            }
        } catch (err) {
            console.error("Error excluding file:", err);
        } finally {
            setExcludingFileId(null);
        }
    }, [excludingFileId, refreshFiles]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [filesRes, analysisRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/files`, { method: "POST" }),
                    fetch(`/api/analyses/${id}`)
                ]);

                if (filesRes.ok) {
                    const data = await filesRes.json();
                    setFiles(Array.isArray(data) ? data : []);
                } else {
                    throw new Error("Error al cargar los archivos");
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
                <button
                    onClick={() => router.back()}
                    className="mt-4 text-blue-600 hover:underline"
                >
                    Volver al análisis
                </button>
            </div>
        );
    }

    const tenderFiles = files.filter(f => f.category === 'tender' && !f.is_processed_version);
    const proposalFiles = files.filter(f => f.category === 'proposal' && !f.is_processed_version);
    const unclassifiedFiles = files.filter(f => f.category === 'unclassified' && !f.is_processed_version);

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
                        <FileText className="w-6 h-6 text-blue-600" />
                        Archivos del Análisis
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="grid md:grid-cols-2 gap-6">
                    <Skeleton className="h-64 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Unclassified Files */}
                    {unclassifiedFiles.length > 0 && (
                        <div className="bg-white rounded-xl border border-amber-200 p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                                <HelpCircle className="w-5 h-5 text-amber-500" />
                                Sin Clasificar
                            </h2>
                            <ul className="space-y-3">
                                {unclassifiedFiles.map(file => (
                                    <li key={file.id} className="flex items-center justify-between text-sm p-3 bg-zinc-50 rounded-lg border border-zinc-100 group hover:border-amber-200 transition-colors">
                                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
                                            <span className="truncate font-medium text-zinc-700">{file.file_name}</span>
                                            <span className="text-zinc-400 text-xs whitespace-nowrap font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                                                {formatBytes(file.file_size)}
                                            </span>
                                            {(file.total_chunks || 0) > 0 && (
                                                <a
                                                    href={`/analyses/${id}/files/${file.id}/chunks`}
                                                    className="flex items-center gap-1 text-orange-600 bg-orange-50 border border-orange-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider hover:bg-orange-100 transition-colors"
                                                    title="Ver chunks extraídos"
                                                >
                                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                                    chunks: {file.total_chunks}
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {file.is_reorderable && (
                                                <button
                                                    onClick={() => openMoveModal(file)}
                                                    className="text-amber-500 hover:text-amber-700 transition-colors p-1.5 hover:bg-amber-50 rounded-md flex items-center gap-1 text-xs font-medium"
                                                    title="Mover archivo"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                    Mover
                                                </button>
                                            )}
                                            {getViewUrl(file) && (
                                                <a
                                                    href={getViewUrl(file)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-zinc-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-md"
                                                    title="Ver documento"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </a>
                                            )}
                                            {getDownloadUrl(file) && (
                                                <a
                                                    href={getDownloadUrl(file)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                                    title="Descargar documento"
                                                    download={file.file_name}
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

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
                                            {(file.total_chunks || 0) > 0 && (
                                                <a
                                                    href={`/analyses/${id}/files/${file.id}/chunks`}
                                                    className="flex items-center gap-1 text-orange-600 bg-orange-50 border border-orange-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider hover:bg-orange-100 transition-colors"
                                                    title="Ver chunks extraídos"
                                                >
                                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                                    chunks: {file.total_chunks}
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {file.is_reorderable && (
                                                <>
                                                    <button
                                                        onClick={() => openMoveModal(file)}
                                                        className="text-amber-500 hover:text-amber-700 transition-colors p-1.5 hover:bg-amber-50 rounded-md flex items-center gap-1 text-xs font-medium"
                                                        title="Mover archivo"
                                                    >
                                                        <ArrowRightLeft className="w-4 h-4" />
                                                        Mover
                                                    </button>
                                                    <button
                                                        onClick={() => handleExclude(file)}
                                                        disabled={excludingFileId === file.id}
                                                        className="text-red-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-md flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                                                        title="Excluir archivo"
                                                    >
                                                        {excludingFileId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                                        Excluir
                                                    </button>
                                                </>
                                            )}
                                            {file.is_merged && (
                                                <a
                                                    href={`/analyses/${id}/files/${file.id}/chat`}
                                                    className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md"
                                                    title="Chat con este documento"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </a>
                                            )}
                                            {getViewUrl(file) && (
                                                <a
                                                    href={getViewUrl(file)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-zinc-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-md"
                                                    title="Ver documento"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </a>
                                            )}
                                            {getDownloadUrl(file) && (
                                                <a
                                                    href={getDownloadUrl(file)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                                    title="Descargar documento"
                                                    download={file.file_name}
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-zinc-400 italic">No hay archivos de pliego.</p>
                        )}
                    </div>

                    {/* Proposal Files */}
                    <div className="space-y-6">
                        {proposalFiles.length > 0 ? (
                            Object.entries(proposalFiles.reduce((acc, file) => {
                                // Prioritize provider name, then label, then default
                                const label = file.proposal_provider_name || file.proposal_label || 'Sin etiqueta';
                                if (!acc[label]) acc[label] = [];
                                acc[label].push(file);
                                return acc;
                            }, {} as Record<string, AnalysisFile[]>)).map(([label, files]) => (
                                <div key={label} className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                                    <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-green-600" />
                                        Oferta: {label}
                                    </h2>
                                    <ul className="space-y-3">
                                        {files.map(file => (
                                            <li key={file.id} className="flex items-center justify-between text-sm p-3 bg-zinc-50 rounded-lg border border-zinc-100 group hover:border-blue-200 transition-colors">
                                                <div className="flex items-center gap-2 overflow-hidden flex-1 mr-4">
                                                    <span className="truncate font-medium text-zinc-700">{file.file_name}</span>
                                                    <span className="text-zinc-400 text-xs whitespace-nowrap font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                                                        {formatBytes(file.file_size)}
                                                    </span>
                                                    {(file.total_chunks || 0) > 0 && (
                                                        <a
                                                            href={`/analyses/${id}/files/${file.id}/chunks`}
                                                            className="flex items-center gap-1 text-orange-600 bg-orange-50 border border-orange-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider hover:bg-orange-100 transition-colors"
                                                            title="Ver chunks extraídos"
                                                        >
                                                            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                                                            chunks: {file.total_chunks}
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {file.is_reorderable && (
                                                        <>
                                                            <button
                                                                onClick={() => openMoveModal(file)}
                                                                className="text-amber-500 hover:text-amber-700 transition-colors p-1.5 hover:bg-amber-50 rounded-md flex items-center gap-1 text-xs font-medium"
                                                                title="Mover archivo"
                                                            >
                                                                <ArrowRightLeft className="w-4 h-4" />
                                                                Mover
                                                            </button>
                                                            <button
                                                                onClick={() => handleExclude(file)}
                                                                disabled={excludingFileId === file.id}
                                                                className="text-red-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-md flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                                                                title="Excluir archivo"
                                                            >
                                                                {excludingFileId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                                                Excluir
                                                            </button>
                                                        </>
                                                    )}
                                                    {file.is_merged && (
                                                        <a
                                                            href={`/analyses/${id}/files/${file.id}/chat`}
                                                            className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md"
                                                            title="Chat con este documento"
                                                        >
                                                            <MessageSquare className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                    {getViewUrl(file) && (
                                                        <a
                                                            href={getViewUrl(file)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-zinc-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-md"
                                                            title="Ver documento"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                    {getDownloadUrl(file) && (
                                                        <a
                                                            href={getDownloadUrl(file)!}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                                            title="Descargar documento"
                                                            download={file.file_name}
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))
                        ) : (
                            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                                <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-green-600" />
                                    Ofertas
                                </h2>
                                <p className="text-sm text-zinc-400 italic">No hay archivos de oferta.</p>
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* Move File Modal */}
            {moveFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isMoving && setMoveFile(null)}>
                    <div className="bg-white rounded-xl border border-zinc-200 shadow-lg w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
                            <h3 className="font-semibold text-zinc-900">Mover archivo</h3>
                            <button
                                onClick={() => !isMoving && setMoveFile(null)}
                                className="p-1 hover:bg-zinc-100 rounded-md transition-colors"
                            >
                                <X className="w-4 h-4 text-zinc-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-zinc-500 mb-4">
                                <span className="font-medium text-zinc-700">{moveFile.file_name}</span>
                            </p>
                            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2">Seleccionar destino</p>
                            {isLoadingSources ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
                                </div>
                            ) : sources.length === 0 ? (
                                <p className="text-sm text-zinc-400 italic text-center py-4">No hay destinos disponibles.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {sources.map(source => (
                                        <li key={source.id}>
                                            <button
                                                onClick={() => setSelectedSource(source)}
                                                disabled={isMoving}
                                                className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 disabled:opacity-50 ${
                                                    selectedSource?.id === source.id
                                                        ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400"
                                                        : "border-zinc-100 hover:border-blue-300 hover:bg-blue-50/50"
                                                }`}
                                            >
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                                                    source.type === "proposal"
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-blue-100 text-blue-700"
                                                }`}>
                                                    {source.type === "proposal" ? "Propuesta" : "Pliego"}
                                                </span>
                                                <span className="text-sm text-zinc-700">{source.label}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-100">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMoveFile(null)}
                                disabled={isMoving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleMove}
                                disabled={!selectedSource || isMoving}
                                className="bg-amber-500 text-white hover:bg-amber-600"
                            >
                                {isMoving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                )}
                                Mover
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
