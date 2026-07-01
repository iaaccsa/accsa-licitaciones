"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";

interface AuditLog {
    id: string;
    created_at: string;
    user_id: string | null;
    user_email: string | null;
    action: string;
    status: string;
    resource_type: string | null;
    resource_id: string | null;
    analysis_id: string | null;
    ip_address: string | null;
    details: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<string, string> = {
    "analysis.create": "Crear análisis",
    "analysis.delete": "Borrar análisis",
    "analysis.download": "Descargar fuentes",
    "admissibility.override": "Override admisibilidad",
    "requirement.update": "Editar requisitos",
    "compliance_result.update": "Editar compliance",
    "llm_config.update": "Config LLM",
};

const STATUS_STYLE: Record<string, string> = {
    success: "text-green-700 border-green-300",
    failure: "text-red-700 border-red-300",
    denied: "text-amber-700 border-amber-300",
};

const PAGE_SIZE = 50;
const selectClass =
    "h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50";
const inputClass =
    "h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50";

function shortId(id: string | null): string {
    return id ? id.slice(0, 8) : "-";
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("es-UY", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function AdminAuditPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    const [action, setAction] = useState("");
    const [analysisId, setAnalysisId] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [offset, setOffset] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const filters: Record<string, unknown> = { limit: PAGE_SIZE, offset };
            if (action) filters.action = action;
            if (analysisId.trim()) filters.analysis_id = analysisId.trim();
            if (dateFrom) filters.date_from = new Date(dateFrom).toISOString();
            if (dateTo) filters.date_to = new Date(dateTo).toISOString();

            const res = await fetch("/api/admin/audit-logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(filters),
            });
            if (!res.ok) {
                setPageError(res.status === 403 ? "Acceso denegado." : "No se pudieron cargar los registros.");
                setLogs([]);
                return;
            }
            setLogs(await res.json());
            setPageError(null);
        } catch {
            setPageError("Error de red. Intente nuevamente.");
        } finally {
            setLoading(false);
        }
    }, [action, analysisId, dateFrom, dateTo, offset]);

    useEffect(() => {
        // Filter-driven reload with offset paging; SWR rewrite pending, needs live QA.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    function applyFilters(e: React.FormEvent) {
        e.preventDefault();
        setOffset(0);
        load();
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <AdminPageHeader backHref="/admin/review" title="Auditoría" />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={applyFilters} className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Acción
                            <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
                                <option value="">Todas</option>
                                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Análisis ID
                            <input
                                value={analysisId}
                                onChange={(e) => setAnalysisId(e.target.value)}
                                placeholder="uuid"
                                className={inputClass}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Desde
                            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Hasta
                            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
                        </label>
                        <Button type="submit">Filtrar</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Registros</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : pageError ? (
                        <p className="text-sm text-red-600" role="alert">{pageError}</p>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-zinc-500">No hay registros para los filtros aplicados.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
                                        <th className="py-2 pr-3 font-medium">Fecha</th>
                                        <th className="py-2 pr-3 font-medium">Usuario</th>
                                        <th className="py-2 pr-3 font-medium">Acción</th>
                                        <th className="py-2 pr-3 font-medium">Estado</th>
                                        <th className="py-2 pr-3 font-medium">Recurso</th>
                                        <th className="py-2 pr-3 font-medium">Análisis</th>
                                        <th className="py-2 pr-3 font-medium">Detalles</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="align-top">
                                            <td className="py-2 pr-3 whitespace-nowrap text-zinc-600">{formatDate(log.created_at)}</td>
                                            <td className="py-2 pr-3 text-zinc-700">{log.user_email ?? "-"}</td>
                                            <td className="py-2 pr-3">{ACTION_LABELS[log.action] ?? log.action}</td>
                                            <td className="py-2 pr-3">
                                                <Badge variant="outline" className={STATUS_STYLE[log.status] ?? ""}>
                                                    {log.status}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-3 text-zinc-600">
                                                {log.resource_type ?? "-"}
                                                {log.resource_id && (
                                                    <span className="text-zinc-400"> ({shortId(log.resource_id)})</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 font-mono text-xs text-zinc-500">{shortId(log.analysis_id)}</td>
                                            <td className="py-2 pr-3">
                                                {log.details ? (
                                                    <details>
                                                        <summary className="cursor-pointer text-zinc-500 text-xs">ver</summary>
                                                        <pre className="mt-1 max-w-md whitespace-pre-wrap break-all text-xs text-zinc-600">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </pre>
                                                    </details>
                                                ) : (
                                                    <span className="text-zinc-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        >
                            Anterior
                        </Button>
                        <span className="text-xs text-zinc-500">
                            {offset + 1}-{offset + logs.length}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || logs.length < PAGE_SIZE}
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                        >
                            Siguiente
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
