"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { FileUploadZone } from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";

type UploadStatus = "idle" | "success" | "error";
type AnalysisResult = Record<string, unknown> | null;

export function UploadSection() {
    const [tenderFiles, setTenderFiles] = useState<File[]>([]);
    const [proposals, setProposals] = useState<File[][]>([[]]);
    const [isPending, startTransition] = useTransition();
    const [status, setStatus] = useState<UploadStatus>("idle");
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [uploadKey, setUploadKey] = useState(0);

    const totalProposalFiles = proposals.reduce((sum, p) => p.length + sum, 0);
    const hasFiles = tenderFiles.length > 0 || totalProposalFiles > 0;

    const clearNotifications = useCallback(() => {
        if (status !== "idle") {
            setStatus("idle");
            setAnalysisResult(null);
            setErrorMessage(null);
        }
    }, [status]);

    const handleTenderFilesChange = useCallback(
        (files: File[]) => {
            setTenderFiles(files);
            clearNotifications();
        },
        [clearNotifications]
    );

    const handleProposalFilesChange = useCallback(
        (index: number, files: File[]) => {
            setProposals((prev) => {
                const next = [...prev];
                next[index] = files;
                return next;
            });
            clearNotifications();
        },
        [clearNotifications]
    );

    const addProposal = useCallback(() => {
        setProposals((prev) => [...prev, []]);
    }, []);

    const removeProposal = useCallback((index: number) => {
        setProposals((prev) => prev.filter((_, i) => i !== index));
        setUploadKey((prev) => prev + 1);
    }, []);

    const handleAnalysis = useCallback(async () => {
        if (!hasFiles) return;

        setAnalysisResult(null);
        setErrorMessage(null);
        setStatus("idle");

        try {
            // Dynamic import: JSZip (~300KB) only loads when user clicks submit
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();

            // Add tender files -> 'tender' folder
            const tenderFolder = zip.folder("tender");
            for (const file of tenderFiles) {
                const buffer = await file.arrayBuffer();
                tenderFolder?.file(file.name, buffer);
            }

            // Add each proposal group -> 'proposal1', 'proposal2', etc.
            for (let i = 0; i < proposals.length; i++) {
                const proposalFolder = zip.folder(`proposal${i + 1}`);
                for (const file of proposals[i]) {
                    const buffer = await file.arrayBuffer();
                    proposalFolder?.file(file.name, buffer);
                }
            }

            // Generate ZIP blob
            const zipBlob = await zip.generateAsync({ type: "blob" });

            // Create FormData and send to API
            const formData = new FormData();
            formData.append("file", zipBlob, "analysis_documents.zip");

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setAnalysisResult(data);
                setStatus("success");

                // Clear all files by remounting components with new key
                setTenderFiles([]);
                setProposals([[]]);
                setUploadKey((prev) => prev + 1);
            } else {
                setErrorMessage(data.error || "No se pudo iniciar el análisis");
                setStatus("error");
            }
        } catch (error) {
            console.error("Error uploading files:", error);
            setErrorMessage("Error de conexión. Inténtelo después.");
            setStatus("error");
        }
    }, [tenderFiles, proposals, hasFiles]);

    const handleAnalysisWithTransition = useCallback(() => {
        startTransition(async () => {
            await handleAnalysis();
        });
    }, [handleAnalysis]);

    return (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 mb-6">
            <h2 className="text-lg font-medium text-zinc-700 mb-6">
                Subir Documentos
            </h2>

            <div key={uploadKey} className="space-y-6 mb-8">
                {/* Tender documents — Full width */}
                <FileUploadZone
                    title="Pliego de Condiciones y Normativas"
                    description="Subir documentos base y normativas aplicables"
                    subtitle="Hasta 15 archivos PDF (máx. 10 MB c/u)"
                    icon="document"
                    accept=".pdf"
                    maxFiles={15}
                    maxSizeMB={10}
                    onFilesChange={handleTenderFilesChange}
                />

                {/* Proposals — Dynamic list */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-zinc-600">
                            Ofertas ({proposals.length})
                        </h3>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addProposal}
                            className="text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar Oferta
                        </Button>
                    </div>

                    {proposals.map((_, index) => (
                        <div key={`proposal-${uploadKey}-${index}`} className="relative">
                            {proposals.length > 1 ? (
                                <button
                                    type="button"
                                    onClick={() => removeProposal(index)}
                                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    title="Eliminar oferta"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            ) : null}
                            <FileUploadZone
                                title={`Oferta${proposals.length > 1 ? ` ${index + 1}` : ""}`}
                                description="Subir oferta técnica"
                                subtitle="Hasta 10 archivos PDF (máx. 10 MB c/u)"
                                icon="ofertas"
                                accept=".pdf"
                                maxFiles={10}
                                maxSizeMB={10}
                                onFilesChange={(files) =>
                                    handleProposalFilesChange(index, files)
                                }
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Status Messages */}
            {status === "success" ? (
                <div className="flex flex-col items-center justify-center gap-2 mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        <span>Análisis iniciado con éxito.</span>
                    </div>
                    {analysisResult ? (
                        <div className="flex flex-col items-center gap-1">
                            {analysisResult.slug ? (
                                <p className="text-sm text-green-600">
                                    ID del análisis:{" "}
                                    <code className="bg-green-100 px-2 py-0.5 rounded font-mono uppercase">
                                        {String(analysisResult.slug)}
                                    </code>
                                </p>
                            ) : null}
                            <Link
                                href="/status"
                                className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
                            >
                                Ver estado del análisis →
                            </Link>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {status === "error" ? (
                <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span>
                        {errorMessage || "No se pudo iniciar el análisis."}
                    </span>
                </div>
            ) : null}

            {/* Action Button */}
            <Button
                onClick={handleAnalysisWithTransition}
                variant="outline"
                disabled={!hasFiles || isPending}
                className="w-full py-6 text-lg font-medium text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isPending ? (
                    <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Enviando...
                    </>
                ) : (
                    "Iniciar Análisis"
                )}
            </Button>
        </div>
    );
}
