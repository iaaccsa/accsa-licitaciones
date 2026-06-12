"use client";

import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, FileText, CalendarClock, FileStack, PauseCircle } from "lucide-react";
import Link from "next/link";
import { MetricBox } from "./MetricBox";

export interface Analysis {
    id: string;
    slug: string;
    user_assigned_name: string | null;
    generated_name: string | null;
    status: "pending" | "processing" | "ready" | "failed" | "awaiting_approval";
    is_success: boolean | null;
    created_at: string;
    total_events: number;
    total_files: number;
    total_proposals: number | null;
}

function getRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "hace unos segundos";
    if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} minutos`;
    if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} horas`;
    if (diffInSeconds < 604800) return `hace ${Math.floor(diffInSeconds / 86400)} días`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function getNameFontSize(name: string) {
    if (name.length <= 12) return "text-lg";
    if (name.length <= 20) return "text-base";
    if (name.length <= 30) return "text-sm";
    return "text-xs";
}

export function AnalysisCard({ analysis, basePath = "/analyses" }: { analysis: Analysis; basePath?: string }) {
    const displayName = analysis.user_assigned_name ?? analysis.generated_name ?? analysis.slug;
    return (
        <Link
            href={`${basePath}/${analysis.id}`}
            className="block bg-white rounded-xl border border-zinc-200 p-4 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="flex justify-between items-start mb-3">
                <span className={`font-mono font-medium text-zinc-700 uppercase ${getNameFontSize(displayName)}`}>
                    {displayName}
                </span>
                <StatusIcon status={analysis.status} isSuccess={analysis.is_success} />
            </div>
            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
                <MetricBox
                    icon={FileStack}
                    value={analysis.total_proposals}
                    label="Propuestas"
                />
                <MetricBox
                    icon={FileText}
                    value={analysis.total_files}
                    label="Archivos"
                />
                <MetricBox
                    icon={CalendarClock}
                    value={analysis.total_events}
                    label="Eventos"
                />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-zinc-100">
                <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1.5" />
                    {getRelativeTime(analysis.created_at)}
                </div>
                <StatusBadge status={analysis.status} isSuccess={analysis.is_success} />
            </div>
        </Link>
    );
}

function StatusIcon({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "processing") return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    if (status === "pending") return <Clock className="w-5 h-5 text-zinc-400" />;
    if (status === "awaiting_approval") return <PauseCircle className="w-5 h-5 text-amber-500" />;
    if (status === "ready") {
        return isSuccess ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
            <XCircle className="w-5 h-5 text-red-500" />
        );
    }
    return <AlertCircle className="w-5 h-5 text-gray-400" />;
}

function StatusBadge({ status, isSuccess }: { status: string; isSuccess: boolean | null }) {
    if (status === "processing") return <span className="text-blue-600">Procesando</span>;
    if (status === "pending") return <span className="text-zinc-500">Pendiente</span>;
    if (status === "awaiting_approval") return <span className="text-amber-600">Esperando Aprovación</span>;
    if (status === "ready") {
        return isSuccess ? (
            <span className="text-green-600">Completado</span>
        ) : (
            <span className="text-red-600">Fallido</span>
        );
    }
    return <span className="text-gray-500">Desconocido</span>;
}


