"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, GitBranch, CheckCircle2, XCircle, Clock, Settings, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkflowStep {
    code: string;
    parent_code: string | null;
    label: string;
    status: "pending" | "running" | "completed" | "failed" | "success" | "processing";
    display_name?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    completed: { label: "Completado", className: "bg-blue-100 text-blue-700", Icon: CheckCircle2 },
    success:   { label: "Exitoso",    className: "bg-blue-100 text-blue-700", Icon: CheckCircle2 },
    running:   { label: "Ejecutando", className: "bg-orange-100 text-orange-700", Icon: Settings },
    processing:{ label: "Procesando", className: "bg-orange-100 text-orange-700", Icon: Settings },
    failed:    { label: "Fallido",    className: "bg-red-100 text-red-700", Icon: XCircle },
    pending:   { label: "Pendiente",  className: "bg-zinc-100 text-zinc-500", Icon: Clock },
};

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500", Icon: AlertCircle };
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

    const [steps, setSteps] = useState<WorkflowStep[]>([]);
    const [analysis, setAnalysis] = useState<{ slug: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSteps = useCallback(async () => {
        try {
            const res = await fetch(`/api/analyses/${id}/workflow`, {
                method: "POST",
                body: JSON.stringify({ uuid: id }),
            });
            if (!res.ok) throw new Error("Error fetching workflow");
            const data = await res.json();
            setSteps(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            setError("No se pudo cargar el flujo de proceso.");
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!id) return;
        fetchSteps();
        fetch(`/api/analyses/${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setAnalysis(data); })
            .catch(() => {});
    }, [id, fetchSteps]);

    // Build a lookup for parent labels
    const codeToName = Object.fromEntries(
        steps.map(s => [s.code, s.display_name || s.label || s.code])
    );

    if (error) {
        return (
            <div className="max-w-5xl mx-auto py-12 px-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
                <p className="text-zinc-600">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline">
                    Volver al análisis
                </button>
            </div>
        );
    }

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
                        <GitBranch className="w-6 h-6 text-orange-500" />
                        Flujo de Proceso
                    </h1>
                </div>
                {analysis && (
                    <span className="font-mono text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 uppercase">
                        {analysis.slug}
                    </span>
                )}
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
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
                        <GitBranch className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                        <p className="text-zinc-400 italic">No hay pasos de flujo registrados para este análisis.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 bg-zinc-50/60">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Código</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Nombre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Paso Padre</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {steps.map((step) => (
                                    <tr key={step.code} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap">
                                            {step.code}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-800 font-medium">
                                            {step.display_name || step.label || (
                                                <span className="text-zinc-400 italic">—</span>
                                            )}
                                            {step.display_name && step.label && step.display_name !== step.label && (
                                                <span className="ml-2 text-xs text-zinc-400">({step.label})</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-zinc-400 whitespace-nowrap">
                                            {step.parent_code ? (
                                                <span title={codeToName[step.parent_code]}>
                                                    {step.parent_code}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <StatusBadge status={step.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-4 py-3 border-t border-zinc-100 text-xs text-zinc-400 text-right">
                            {steps.length} {steps.length === 1 ? "paso" : "pasos"}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
