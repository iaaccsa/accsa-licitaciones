"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { JobStatusDisplay } from "@/components/JobStatusDisplay";
import type { JobStatus } from "@/components/JobStatusDisplay";

type StatusCheckStatus = "idle" | "success" | "error" | "not_found";

interface StatusCheckSectionProps {
    initialJobId?: string;
}

export function StatusCheckSection({ initialJobId }: StatusCheckSectionProps) {
    const [searchJobId, setSearchJobId] = useState(initialJobId ?? "");
    const [isPending, startTransition] = useTransition();
    const [statusCheckStatus, setStatusCheckStatus] =
        useState<StatusCheckStatus>("idle");
    const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Sync initialJobId when it changes (e.g. after a new upload)
    useEffect(() => {
        if (initialJobId) {
            setSearchJobId(initialJobId);
        }
    }, [initialJobId]);

    const handleCheckStatus = useCallback(async () => {
        if (!searchJobId.trim()) return;

        setJobStatus(null);

        try {
            const response = await fetch(
                `/api/status?job_id=${encodeURIComponent(searchJobId.trim())}`
            );

            if (response.ok) {
                const data = await response.json();
                if (!data || Object.keys(data).length === 0) {
                    setStatusCheckStatus("not_found");
                } else {
                    setJobStatus(data);
                    setStatusCheckStatus("success");
                }
            } else {
                setStatusCheckStatus("error");
            }
        } catch (error) {
            console.error("Error checking status:", error);
            setStatusCheckStatus("error");
        }
    }, [searchJobId]);

    const handleCheckStatusWithTransition = useCallback(() => {
        startTransition(async () => {
            await handleCheckStatus();
        });
    }, [handleCheckStatus]);

    // Auto-refresh effect
    useEffect(() => {
        if (autoRefresh && searchJobId.trim() && statusCheckStatus === "success") {
            autoRefreshIntervalRef.current = setInterval(() => {
                handleCheckStatus();
            }, 30000);
        }

        return () => {
            if (autoRefreshIntervalRef.current) {
                clearInterval(autoRefreshIntervalRef.current);
                autoRefreshIntervalRef.current = null;
            }
        };
    }, [autoRefresh, searchJobId, statusCheckStatus, handleCheckStatus]);

    return (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
            <h2 className="text-lg font-medium text-zinc-700 mb-6">
                Consultar Estado del Análisis
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <input
                    type="text"
                    value={searchJobId}
                    onChange={(e) => setSearchJobId(e.target.value)}
                    placeholder="Ingrese el ID del procesamiento (job_id)"
                    className="flex-1 px-4 py-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-zinc-700 placeholder:text-zinc-400"
                />
                <Button
                    onClick={handleCheckStatusWithTransition}
                    disabled={!searchJobId.trim() || isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <Search className="h-5 w-5" />
                    )}
                    Consultar
                </Button>
            </div>

            {/* Auto-refresh checkbox */}
            {jobStatus && statusCheckStatus === "success" ? (
                <div className="flex items-center gap-3 mb-6">
                    <input
                        type="checkbox"
                        id="autoRefresh"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-zinc-100 border-zinc-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label
                        htmlFor="autoRefresh"
                        className="text-sm text-zinc-600 cursor-pointer"
                    >
                        Actualizar automáticamente cada 30 segundos
                    </label>
                    {autoRefresh ? (
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Activo
                        </span>
                    ) : null}
                </div>
            ) : null}

            {/* Status messages */}
            {statusCheckStatus === "error" ? (
                <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    <span>
                        No se pudo obtener el estado. Verifique el ID e intente de nuevo.
                    </span>
                </div>
            ) : null}

            {statusCheckStatus === "not_found" ? (
                <div className="flex items-center justify-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700">
                    <AlertCircle className="h-5 w-5" />
                    <span>ID de Análisis no existe.</span>
                </div>
            ) : null}

            {/* Job Status Display */}
            {jobStatus && statusCheckStatus === "success" ? (
                <JobStatusDisplay jobStatus={jobStatus} />
            ) : null}
        </div>
    );
}
