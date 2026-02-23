"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Download, ChevronLeft, AlertCircle, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

    const tenderFiles = files.filter(f => f.category === 'tender');
    const proposalFiles = files.filter(f => f.category === 'proposal');

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
                                            {file.is_processed_version ? (
                                                <span className="text-blue-600 bg-blue-50 border border-blue-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                                    Procesado
                                                </span>
                                            ) : (
                                                <span className="text-zinc-500 bg-zinc-50 border border-zinc-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                                    Original
                                                </span>
                                            )}
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
                                            {file.is_merged && (
                                                <a
                                                    href={`/analyses/${id}/files/${file.id}/chat`}
                                                    className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md"
                                                    title="Chat con este documento"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </a>
                                            )}
                                            <a
                                                href={`${SUPABASE_STORAGE_URL}/${file.storage_path}?download=${encodeURIComponent(file.file_name)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                                title="Descargar documento"
                                                download={file.file_name}
                                            >
                                                <Download className="w-4 h-4" />
                                            </a>
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
                                                    {file.is_processed_version ? (
                                                        <span className="text-blue-600 bg-blue-50 border border-blue-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                                            Procesado
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-500 bg-zinc-50 border border-zinc-100 text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                                            Original
                                                        </span>
                                                    )}
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
                                                    {file.is_merged && (
                                                        <a
                                                            href={`/analyses/${id}/files/${file.id}/chat`}
                                                            className="text-zinc-400 hover:text-violet-600 transition-colors p-1.5 hover:bg-violet-50 rounded-md"
                                                            title="Chat con este documento"
                                                        >
                                                            <MessageSquare className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                    <a
                                                        href={`${SUPABASE_STORAGE_URL}/${file.storage_path}?download=${encodeURIComponent(file.file_name)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-zinc-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-md"
                                                        title="Descargar documento"
                                                        download={file.file_name}
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </a>
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
        </div>
    );
}
