"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FileText, Download, Eye, X, ChevronLeft, AlertCircle, MessageSquare, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

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
    kind: "original" | "processed";
    total_chunks?: number;
    analysis_id: string;
    proposal_id?: string;
    is_merged?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any> | null;
}

const SUPABASE_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL;

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileUrl(file: { storage_path: string }): string | null {
    if (!SUPABASE_STORAGE_URL) return null;
    return `${SUPABASE_STORAGE_URL}/${file.storage_path}`;
}

export default function AdminAnalysisFilesPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [files, setFiles] = useState<AnalysisFile[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mdPreview, setMdPreview] = useState<{ name: string; content: string } | null>(null);
    const [mdLoading, setMdLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [metadataModal, setMetadataModal] = useState<{ name: string; data: Record<string, any> } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [originalRes, processedRes, analysisRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/files`, { method: "POST" }),
                    fetch(`/api/analyses/${id}/processed-files`, { method: "POST" }),
                    fetch(`/api/analyses/${id}`),
                ]);

                if (!originalRes.ok) throw new Error("Error al cargar los archivos originales");
                if (!processedRes.ok) throw new Error("Error al cargar los archivos procesados");

                const originalData = await originalRes.json();
                const processedData = await processedRes.json();

                const original: AnalysisFile[] = (Array.isArray(originalData) ? originalData : []).map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (f: any) => ({ ...f, kind: "original" as const })
                );
                const processed: AnalysisFile[] = (Array.isArray(processedData) ? processedData : []).map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (f: any) => ({ ...f, kind: "processed" as const })
                );
                setFiles([...original, ...processed]);

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

        if (id) fetchData();
    }, [id]);

    const openMdPreview = async (file: AnalysisFile) => {
        const url = getFileUrl(file);
        if (!url) return;
        setMdLoading(true);
        try {
            const res = await fetch(url);
            const text = await res.text();
            setMdPreview({ name: file.file_name, content: text });
        } catch {
            setMdPreview({ name: file.file_name, content: "Error al cargar el archivo." });
        } finally {
            setMdLoading(false);
        }
    };

    const handlePreview = (file: AnalysisFile) => {
        if (file.file_name.endsWith(".md")) {
            openMdPreview(file);
        } else {
            const url = getFileUrl(file);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    if (error) {
        return (
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 dark:text-red-400" />
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
                <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <ChevronLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        Archivos
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-800">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                </div>
            ) : files.length === 0 ? (
                <div className="bg-white rounded-xl border border-zinc-200 p-8 shadow-sm text-center dark:bg-zinc-900 dark:border-zinc-800">
                    <p className="text-sm text-zinc-400 italic dark:text-zinc-500">No hay archivos registrados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-800/50">
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide dark:text-zinc-400">Nombre</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide dark:text-zinc-400">Categoría</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide dark:text-zinc-400">Tamaño</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide dark:text-zinc-400">Chunks</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide dark:text-zinc-400">Tipo</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide w-24 dark:text-zinc-400"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {files.map((file) => (
                                <tr key={file.id} className="hover:bg-zinc-50 transition-colors dark:hover:bg-zinc-800">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-zinc-800 truncate max-w-[200px] dark:text-zinc-200" title={file.file_name}>
                                                {file.file_name}
                                            </span>
                                            {file.kind === "processed" ? (
                                                <span className="text-blue-600 bg-blue-50 border border-blue-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-900">
                                                    Procesado
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500 bg-zinc-50 border border-zinc-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0 dark:text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-800">
                                                    Original
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-zinc-600 text-xs dark:text-zinc-400">
                                        {file.category === "tender" ? "Pliego" : file.category === "proposal" ? "Oferta" : "Sin clasificar"}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs whitespace-nowrap dark:text-zinc-400">
                                        {formatBytes(file.file_size)}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs dark:text-zinc-400">
                                        {file.total_chunks ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs dark:text-zinc-400">
                                        {file.mime_type.split("/").pop()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 justify-end">
                                            {file.metadata != null && (
                                                <button
                                                    onClick={() => setMetadataModal({ name: file.file_name, data: file.metadata! })}
                                                    className="text-zinc-400 hover:text-amber-600 transition-colors p-1.5 hover:bg-amber-50 rounded-md dark:text-zinc-500 dark:hover:text-amber-400 dark:hover:bg-amber-950"
                                                    title="Ver metadata"
                                                >
                                                    <Info className="w-4 h-4" />
                                                </button>
                                            )}
                                            {file.is_merged && (
                                                <a
                                                    href={`/admin/analyses/${id}/files/${file.id}/chat`}
                                                    className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md dark:text-zinc-500 dark:hover:text-violet-400 dark:hover:bg-violet-950"
                                                    title="Chat con este documento"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </a>
                                            )}
                                            {getFileUrl(file) && (
                                                <button
                                                    onClick={() => handlePreview(file)}
                                                    className="text-zinc-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-md dark:text-zinc-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-950"
                                                    title="Ver documento"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            )}
                                            <a
                                                href={`${SUPABASE_STORAGE_URL}/${file.storage_path}?download=${encodeURIComponent(file.file_name)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md dark:text-zinc-500 dark:hover:text-blue-400 dark:hover:bg-blue-950"
                                                title="Descargar"
                                                download={file.file_name}
                                            >
                                                <Download className="w-4 h-4" />
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Metadata Modal */}
            {metadataModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4 dark:bg-zinc-900">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                            <h3 className="font-semibold text-zinc-800 truncate flex items-center gap-2 dark:text-zinc-200">
                                <Info className="w-4 h-4 text-amber-500 shrink-0 dark:text-amber-400" />
                                {metadataModal.name}
                            </h3>
                            <button
                                onClick={() => setMetadataModal(null)}
                                className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-500 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-y-auto px-6 py-6 flex-1">
                            <pre className="text-xs text-zinc-700 bg-zinc-50 rounded-lg p-4 border border-zinc-200 whitespace-pre-wrap break-all font-mono dark:text-zinc-300 dark:bg-zinc-800/50 dark:border-zinc-800">
                                {JSON.stringify(metadataModal.data, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}

            {/* Markdown Preview Modal */}
            {(mdPreview || mdLoading) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4 dark:bg-zinc-900">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                            <h3 className="font-semibold text-zinc-800 truncate dark:text-zinc-200">
                                {mdPreview?.name ?? "Cargando..."}
                            </h3>
                            <button
                                onClick={() => setMdPreview(null)}
                                className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-500 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-y-auto px-6 py-6 flex-1">
                            {mdLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-5/6" />
                                    <Skeleton className="h-4 w-2/3" />
                                </div>
                            ) : (
                                <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
                                    <ReactMarkdown>{mdPreview!.content}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
