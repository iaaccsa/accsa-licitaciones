"use client";

import React from "react";
import useSWR from "swr";
import { fetcher, postFetcher } from "@/lib/swr";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, GitBranch, CheckCircle2, XCircle, Clock, Settings, Layers, Play, Pause } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkflowStep {
    code: string;
    parent_code: string | null;
    label: string;
    status: "pending" | "running" | "completed" | "failed" | "success" | "processing";
    display_name?: string;
    instances_count?: number;
}

interface Phase {
    id: string;
    code: string;
    display_name: string;
    type: "processing" | "approval";
    status: "pending" | "running" | "completed" | "failed";
    progress: number;
    order: number;
    started_at: string | null;
    ended_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    completed: { label: "Completado", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",   Icon: CheckCircle2 },
    success:   { label: "Exitoso",    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",   Icon: CheckCircle2 },
    running:   { label: "Ejecutando", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", Icon: Settings },
    processing:{ label: "Procesando", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", Icon: Settings },
    failed:    { label: "Fallido",    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",     Icon: XCircle },
    pending:   { label: "Pendiente",  className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",   Icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400", Icon: AlertCircle };
    const Icon = cfg.Icon;
    const isRunning = status === "running" || status === "processing";
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
            <Icon className={`w-3 h-3 ${isRunning ? "animate-spin" : ""}`} />
            {cfg.label}
        </span>
    );
}

export default function AnalysisFlowPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const { data: stepsData, error: stepsError, isLoading } = useSWR<WorkflowStep[]>(
        id ? [`/api/analyses/${id}/workflow`, { uuid: id }] : null,
        postFetcher,
        { revalidateOnFocus: false },
    );
    const steps = Array.isArray(stepsData) ? stepsData : [];

    const { data: phasesData, isLoading: phasesLoading } = useSWR<Phase[]>(
        id ? `/api/analyses/${id}/phases` : null,
        fetcher,
        { revalidateOnFocus: false },
    );
    const phases = Array.isArray(phasesData)
        ? [...phasesData].sort((a, b) => a.order - b.order)
        : [];

    const { data: analysis } = useSWR<{ slug: string; status: string }>(
        id ? `/api/analyses/${id}` : null,
        fetcher,
        { revalidateOnFocus: false },
    );

    const error = stepsError ? "No se pudo cargar el flujo de proceso." : null;

    const codeToName = Object.fromEntries(
        steps.map(s => [s.code, s.display_name || s.label || s.code])
    );

    if (error) {
        return (
            <div className="max-w-6xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 dark:text-red-400" />
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
                <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
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
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                    </button>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <GitBranch className="w-6 h-6 text-orange-500 dark:text-orange-400" />
                        Flujo de Proceso
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-800">
                        {analysis.slug}
                    </span>
                )}
            </div>

            {/* Phases table */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
                <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/60 flex items-center gap-2 dark:border-zinc-800 dark:bg-zinc-800/60">
                    <Layers className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider dark:text-zinc-400">Fases del análisis</span>
                </div>
                {phasesLoading ? (
                    <div className="p-6 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-5 w-8" />
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-5 w-20" />
                                <Skeleton className="h-5 w-20" />
                            </div>
                        ))}
                    </div>
                ) : phases.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-zinc-400 italic text-sm dark:text-zinc-500">No hay fases registradas para este análisis.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider w-10 dark:text-zinc-500">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Nombre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Tipo</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Progreso</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {phases.map((phase) => (
                                    <tr key={phase.id} className="hover:bg-zinc-50/50 transition-colors dark:hover:bg-zinc-800/50">
                                        <td className="px-4 py-3 text-xs font-mono text-zinc-400 dark:text-zinc-500">{phase.order}</td>
                                        <td className="px-4 py-3 text-zinc-800 font-medium whitespace-nowrap dark:text-zinc-200">{phase.display_name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                                phase.type === "processing"
                                                    ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                                                    : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                            }`}>
                                                {phase.type === "processing"
                                                    ? <Play className="w-3 h-3" />
                                                    : <Pause className="w-3 h-3" />
                                                }
                                                {phase.type === "processing" ? "Procesamiento" : "Aprobación"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {phase.type === "processing" ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-700">
                                                        <div
                                                            className="h-full bg-sky-400 rounded-full"
                                                            style={{ width: `${phase.progress}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{phase.progress}%</span>
                                                </div>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <StatusBadge status={phase.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-4 py-3 border-t border-zinc-100 text-xs text-zinc-400 text-right dark:border-zinc-800 dark:text-zinc-500">
                            {phases.length} {phases.length === 1 ? "fase" : "fases"}
                        </div>
                    </div>
                )}
            </div>

            {/* Workflow steps table */}
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
                <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/60 flex items-center gap-2 dark:border-zinc-800 dark:bg-zinc-800/60">
                    <GitBranch className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider dark:text-zinc-400">Pasos del flujo</span>
                </div>
                {isLoading ? (
                    <div className="p-6 space-y-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-48" />
                                <Skeleton className="h-5 w-20" />
                            </div>
                        ))}
                    </div>
                ) : steps.length === 0 ? (
                    <div className="text-center py-16">
                        <GitBranch className="w-10 h-10 text-zinc-300 mx-auto mb-3 dark:text-zinc-600" />
                        <p className="text-zinc-400 italic dark:text-zinc-500">No hay pasos de flujo registrados para este análisis.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Código</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Nombre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Paso Padre</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Instancias</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider dark:text-zinc-500">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {steps.map((step) => (
                                    <tr key={step.code} className="hover:bg-zinc-50/50 transition-colors dark:hover:bg-zinc-800/50">
                                        <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap dark:text-zinc-400">
                                            {step.code}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-800 font-medium dark:text-zinc-200">
                                            {step.display_name || step.label || (
                                                <span className="text-zinc-400 italic dark:text-zinc-500">—</span>
                                            )}
                                            {step.display_name && step.label && step.display_name !== step.label && (
                                                <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">({step.label})</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-zinc-400 whitespace-nowrap dark:text-zinc-500">
                                            {step.parent_code ? (
                                                <span title={codeToName[step.parent_code]}>
                                                    {step.parent_code}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {step.instances_count != null ? (
                                                <span className="font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">{step.instances_count}</span>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <StatusBadge status={step.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-4 py-3 border-t border-zinc-100 text-xs text-zinc-400 text-right dark:border-zinc-800 dark:text-zinc-500">
                            {steps.length} {steps.length === 1 ? "paso" : "pasos"}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
