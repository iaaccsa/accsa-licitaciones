"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Eye, AlertCircle, MessageSquare, ArrowRightLeft, X, Loader2, Ban, Layers } from "lucide-react";
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

interface AnalysisInfo {
    status: string;
    paused_at_service: string | null;
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

function SectionCard({ title, count, children }: { title: string; count: number; children: ReactNode }) {
    return (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-zinc-900 dark:border-zinc-100">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{title}</h2>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{count}</span>
            </div>
            {children}
        </section>
    );
}

function FileRow({
    file,
    analysisId,
    isExcluding,
    onMove,
    onExclude,
}: {
    file: AnalysisFile;
    analysisId: string;
    isExcluding: boolean;
    onMove: (file: AnalysisFile) => void;
    onExclude: (file: AnalysisFile) => void;
}) {
    const viewUrl = getViewUrl(file);
    const downloadUrl = getDownloadUrl(file);
    return (
        <li className="flex items-center justify-between gap-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
            <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{file.file_name}</span>
            <div className="flex items-center gap-1 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 px-2 py-1">
                {file.is_reorderable && (
                    <button
                        onClick={() => onMove(file)}
                        className="flex items-center gap-1 px-1.5 py-1 text-xs font-semibold text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                        title="Mover archivo"
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Mover
                    </button>
                )}
                {file.is_reorderable && file.category !== "unclassified" && (
                    <button
                        onClick={() => onExclude(file)}
                        disabled={isExcluding}
                        className="flex items-center gap-1 px-1.5 py-1 text-xs font-semibold text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Excluir archivo"
                    >
                        {isExcluding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        Excluir
                    </button>
                )}
                {(file.total_chunks || 0) > 0 && (
                    <a
                        href={`/analyses/${analysisId}/files/${file.id}/chunks`}
                        className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                        title={`Ver chunks extraídos (${file.total_chunks})`}
                    >
                        <Layers className="w-4 h-4" />
                    </a>
                )}
                {file.is_merged && (
                    <a
                        href={`/analyses/${analysisId}/files/${file.id}/chat`}
                        className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                        title="Chat con este documento"
                    >
                        <MessageSquare className="w-4 h-4" />
                    </a>
                )}
                {viewUrl && (
                    <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        title="Ver documento"
                    >
                        <Eye className="w-4 h-4" />
                    </a>
                )}
                {downloadUrl && (
                    <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        title="Descargar documento"
                        download={file.file_name}
                    >
                        <Download className="w-4 h-4" />
                    </a>
                )}
            </div>
        </li>
    );
}

export default function AnalysisFilesPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [files, setFiles] = useState<AnalysisFile[]>([]);
    const [analysis, setAnalysis] = useState<AnalysisInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [moveFile, setMoveFile] = useState<AnalysisFile | null>(null);
    const [sources, setSources] = useState<Source[]>([]);
    const [isLoadingSources, setIsLoadingSources] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [selectedSource, setSelectedSource] = useState<Source | null>(null);
    const [excludingFileId, setExcludingFileId] = useState<string | null>(null);
    const [isResuming, setIsResuming] = useState(false);
    const [showValidateConfirm, setShowValidateConfirm] = useState(false);

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

    const handleValidateAndContinue = useCallback(async () => {
        if (isResuming) return;
        setIsResuming(true);
        try {
            const res = await fetch(`/api/analyses/${id}/resume`, { method: "POST" });
            if (res.ok) {
                router.push(`/analyses/${id}`);
                return;
            }
        } catch (err) {
            console.error("Error resuming analysis:", err);
        }
        setIsResuming(false);
    }, [id, isResuming, router]);

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
                    setAnalysis(await analysisRes.json());
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
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
                <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
            </div>
        );
    }

    const tenderFiles = files.filter(f => f.category === 'tender');
    const proposalFiles = files.filter(f => f.category === 'proposal');
    const unclassifiedFiles = files.filter(f => f.category === 'unclassified');

    const proposalGroups = Object.entries(proposalFiles.reduce((acc, file) => {
        const key = file.proposal_id || 'sin-propuesta';
        if (!acc[key]) acc[key] = [];
        acc[key].push(file);
        return acc;
    }, {} as Record<string, AnalysisFile[]>));

    const awaitingFileValidation =
        analysis?.status === "awaiting_approval" &&
        analysis?.paused_at_service === "service-documents-grouper";

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 md:p-8 space-y-6">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 pb-3 border-b border-zinc-900 dark:border-zinc-100">
                    Archivos del análisis
                </h1>

                {isLoading ? (
                    <div className="space-y-6">
                        <Skeleton className="h-56 rounded-2xl" />
                        <Skeleton className="h-56 rounded-2xl" />
                    </div>
                ) : (
                    <>
                        {unclassifiedFiles.length > 0 && (
                            <SectionCard title="Sin clasificar" count={unclassifiedFiles.length}>
                                <ul>
                                    {unclassifiedFiles.map(file => (
                                        <FileRow
                                            key={file.id}
                                            file={file}
                                            analysisId={id}
                                            isExcluding={excludingFileId === file.id}
                                            onMove={openMoveModal}
                                            onExclude={handleExclude}
                                        />
                                    ))}
                                </ul>
                            </SectionCard>
                        )}

                        <SectionCard title="Pliego y normativas" count={tenderFiles.length}>
                            {tenderFiles.length > 0 ? (
                                <ul>
                                    {tenderFiles.map(file => (
                                        <FileRow
                                            key={file.id}
                                            file={file}
                                            analysisId={id}
                                            isExcluding={excludingFileId === file.id}
                                            onMove={openMoveModal}
                                            onExclude={handleExclude}
                                        />
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-zinc-400 dark:text-zinc-500 italic pt-4">No hay archivos de pliego.</p>
                            )}
                        </SectionCard>

                        {proposalGroups.length > 0 ? (
                            proposalGroups.map(([proposalId, groupFiles]) => {
                                const label = groupFiles[0].proposal_label || groupFiles[0].proposal_provider_name || 'Sin etiqueta';
                                return (
                                    <SectionCard key={proposalId} title={`Oferta: ${label}`} count={groupFiles.length}>
                                        <ul>
                                            {groupFiles.map(file => (
                                                <FileRow
                                                    key={file.id}
                                                    file={file}
                                                    analysisId={id}
                                                    isExcluding={excludingFileId === file.id}
                                                    onMove={openMoveModal}
                                                    onExclude={handleExclude}
                                                />
                                            ))}
                                        </ul>
                                    </SectionCard>
                                );
                            })
                        ) : (
                            <SectionCard title="Ofertas" count={0}>
                                <p className="text-sm text-zinc-400 dark:text-zinc-500 italic pt-4">No hay archivos de oferta.</p>
                            </SectionCard>
                        )}

                        {awaitingFileValidation && (
                            <button
                                onClick={() => setShowValidateConfirm(true)}
                                disabled={isResuming}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 text-base font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60"
                            >
                                Validar y continuar
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Validate Confirmation Modal */}
            {showValidateConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isResuming && setShowValidateConfirm(false)}>
                    <div className="relative bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-lg w-full max-w-xl mx-4 p-8" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => !isResuming && setShowValidateConfirm(false)}
                            className="absolute top-3 right-3 p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
                        >
                            <X className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                        </button>
                        <h3 className="text-2xl font-bold text-center text-zinc-900 dark:text-zinc-100 mb-3">¡Atención!</h3>
                        <p className="text-sm text-center text-zinc-700 dark:text-zinc-300 mb-8">
                            Una vez validado no podrá volver a editar la clasificación
                        </p>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleValidateAndContinue}
                                disabled={isResuming}
                                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white py-3 font-medium transition-colors disabled:opacity-60"
                            >
                                {isResuming && <Loader2 className="w-4 h-4 animate-spin" />}
                                Validar
                            </button>
                            <button
                                onClick={() => setShowValidateConfirm(false)}
                                disabled={isResuming}
                                className="flex-1 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white py-3 font-medium transition-colors disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move File Modal */}
            {moveFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isMoving && setMoveFile(null)}>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-lg w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Mover archivo</h3>
                            <button
                                onClick={() => !isMoving && setMoveFile(null)}
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                            >
                                <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">{moveFile.file_name}</span>
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-semibold mb-2">Seleccionar destino</p>
                            {isLoadingSources ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-zinc-300 dark:text-zinc-600 animate-spin" />
                                </div>
                            ) : sources.length === 0 ? (
                                <p className="text-sm text-zinc-400 dark:text-zinc-500 italic text-center py-4">No hay destinos disponibles.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {sources.map(source => (
                                        <li key={source.id}>
                                            <button
                                                onClick={() => setSelectedSource(source)}
                                                disabled={isMoving}
                                                className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 disabled:opacity-50 ${
                                                    selectedSource?.id === source.id
                                                        ? "border-blue-400 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-400"
                                                        : "border-zinc-100 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/50"
                                                }`}
                                            >
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                                                    source.type === "proposal"
                                                        ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                                                        : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                                }`}>
                                                    {source.type === "proposal" ? "Propuesta" : "Pliego"}
                                                </span>
                                                <span className="text-sm text-zinc-700 dark:text-zinc-300">{source.label}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-100 dark:border-zinc-800">
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
