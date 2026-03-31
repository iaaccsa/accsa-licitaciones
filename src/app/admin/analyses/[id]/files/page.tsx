"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Download, Eye, X, ChevronLeft, AlertCircle, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";

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

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [filesRes, analysisRes] = await Promise.all([
                    fetch(`/api/analyses/${id}/files`, { method: "POST" }),
                    fetch(`/api/analyses/${id}`),
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
            <div className="max-w-5xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
                <p className="text-zinc-600">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline">
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Archivos
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
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
                <div className="bg-white rounded-xl border border-zinc-200 p-8 shadow-sm text-center">
                    <p className="text-sm text-zinc-400 italic">No hay archivos registrados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50 text-left">
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide">Nombre</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide">Categoría</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide">Tamaño</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide">Chunks</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide">Tipo</th>
                                <th className="px-4 py-3 font-medium text-zinc-500 text-xs uppercase tracking-wide w-24"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {files.map((file) => (
                                <tr key={file.id} className="hover:bg-zinc-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-zinc-800 truncate max-w-[200px]" title={file.file_name}>
                                                {file.file_name}
                                            </span>
                                            {file.is_processed_version ? (
                                                <span className="text-blue-600 bg-blue-50 border border-blue-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0">
                                                    Procesado
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500 bg-zinc-50 border border-zinc-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0">
                                                    Original
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-zinc-600 text-xs">
                                        {file.category === "tender" ? "Pliego" : "Oferta"}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs whitespace-nowrap">
                                        {formatBytes(file.file_size)}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                                        {file.total_chunks ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                                        {file.mime_type.split("/").pop()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 justify-end">
                                            {file.is_merged && (
                                                <a
                                                    href={`/admin/analyses/${id}/files/${file.id}/chat`}
                                                    className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md"
                                                    title="Chat con este documento"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </a>
                                            )}
                                            {getFileUrl(file) && (
                                                <button
                                                    onClick={() => handlePreview(file)}
                                                    className="text-zinc-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-md"
                                                    title="Ver documento"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            )}
                                            <a
                                                href={`${SUPABASE_STORAGE_URL}/${file.storage_path}?download=${encodeURIComponent(file.file_name)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
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

            {/* Markdown Preview Modal */}
            {(mdPreview || mdLoading) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
                            <h3 className="font-semibold text-zinc-800 truncate">
                                {mdPreview?.name ?? "Cargando..."}
                            </h3>
                            <button
                                onClick={() => setMdPreview(null)}
                                className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-500 hover:text-zinc-800"
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
                                <div className="prose prose-sm prose-zinc max-w-none">
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
