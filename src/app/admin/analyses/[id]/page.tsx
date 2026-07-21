"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Cpu,
  FileText,
  RefreshCw,
  PauseCircle,
  Play,
  GitBranch,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ProposalsList from "@/components/ProposalsList";
import AnalysisCostCard from "@/components/AnalysisCostCard";

const ProposalsComplianceChart = dynamic(
  () => import("@/components/ProposalsComplianceChart"),
  { ssr: false }
);

interface Analysis {
  id: string;
  slug: string;
  user_assigned_name: string | null;
  generated_name: string | null;
  user_email: string | null;
  status: "pending" | "processing" | "ready" | "failed" | "awaiting_approval";
  is_success: boolean | null;
  paused_at_service: string | null;
  primary_model: "gemini" | "openai" | null;
  intelligence_level: "low" | "medium" | "high" | null;
  created_at: string;
  updated_at: string;
}

const MODEL_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

const LEVEL_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
}

export default function AdminAnalysisDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: analysis, isLoading, error, mutate } = useSWR<Analysis>(
    id ? `/api/analyses/${id}` : null,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest &&
        ["pending", "processing", "awaiting_approval"].includes(latest.status)
          ? 10000
          : 0,
      revalidateOnFocus: false,
    },
  );
  const [isResuming, setIsResuming] = useState(false);

  const handleResume = useCallback(async () => {
    if (!analysis || isResuming) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/analyses/${id}/resume`, { method: "POST" });
      if (res.ok) {
        mutate(
          { ...analysis, status: "processing", paused_at_service: null },
          { revalidate: false },
        );
      }
    } catch (err) {
      console.error("Error resuming analysis:", err);
    } finally {
      setIsResuming(false);
    }
  }, [id, analysis, isResuming, mutate]);

  if (error && !analysis) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4 dark:text-red-400" />
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          No se pudo cargar la información del análisis.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <AnalysisDetailSkeleton />;
  }

  if (!analysis) return null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* Admin Header */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {analysis.user_assigned_name || analysis.generated_name || (
              <span className="font-mono uppercase">{analysis.slug}</span>
            )}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refrescar
            </Button>
            {analysis.status === "awaiting_approval" && (
              <Button
                size="sm"
                onClick={handleResume}
                disabled={isResuming}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {isResuming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Continuar
              </Button>
            )}
          </div>
        </div>

        {/* Detail fields table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <DetailField label="ID" value={analysis.id} mono />
          <DetailField label="Slug" value={analysis.slug} mono uppercase />
          <DetailField label="Estado">
            <StatusBadge
              status={analysis.status}
              isSuccess={analysis.is_success}
            />
          </DetailField>
          <DetailField
            label="Éxito"
            value={
              analysis.is_success === null
                ? "—"
                : analysis.is_success
                  ? "Sí"
                  : "No"
            }
          />
          <DetailField
            label="Nombre (usuario)"
            value={analysis.user_assigned_name || "—"}
          />
          <DetailField
            label="Nombre (generado)"
            value={analysis.generated_name || "—"}
          />
          <DetailField label="Correo" value={analysis.user_email || "—"} />
          <DetailField
            label="Pausado en"
            value={analysis.paused_at_service || "—"}
            mono
          />
          <DetailField
            label="Modelo"
            value={
              analysis.primary_model
                ? (MODEL_LABELS[analysis.primary_model] ??
                  analysis.primary_model)
                : "—"
            }
          />
          <DetailField
            label="Inteligencia"
            value={
              analysis.intelligence_level
                ? (LEVEL_LABELS[analysis.intelligence_level] ??
                  analysis.intelligence_level)
                : "—"
            }
          />
          <DetailField label="Creado" value={formatDate(analysis.created_at)} />
          <DetailField
            label="Actualizado"
            value={formatDate(analysis.updated_at)}
          />
        </div>
      </div>

      {/* AI cost breakdown */}
      <AnalysisCostCard analysisId={id} />

      {/* Navigation Buttons */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <a
          href={`/admin/analyses/${id}/flow`}
          className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-orange-300 hover:shadow-md transition-all group text-center dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-orange-800"
        >
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors dark:bg-orange-950 dark:text-orange-400">
            <GitBranch className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-orange-600 transition-colors dark:text-zinc-100 dark:group-hover:text-orange-400">
              Flujo de Proceso
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Ver pasos del flujo de trabajo
            </p>
          </div>
        </a>

        <a
          href={`/admin/analyses/${id}/files`}
          className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group text-center dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-blue-800"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors dark:bg-blue-950 dark:text-blue-400">
            <FileText className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors dark:text-zinc-100 dark:group-hover:text-blue-400">
              Archivos
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pliegos, normativas y ofertas
            </p>
          </div>
        </a>

        <a
          href={`/admin/analyses/${id}/events`}
          className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group text-center dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-purple-800"
        >
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors dark:bg-purple-950 dark:text-purple-400">
            <Cpu className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-purple-600 transition-colors dark:text-zinc-100 dark:group-hover:text-purple-400">
              Historial de Eventos
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ver bitácora de ejecución</p>
          </div>
        </a>

        <a
          href={`/admin/analyses/${id}/evaluation_system`}
          className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-violet-300 hover:shadow-md transition-all group text-center dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-violet-800"
        >
          <div className="p-3 bg-violet-50 text-violet-600 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-colors dark:bg-violet-950 dark:text-violet-400">
            <Scale className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-violet-600 transition-colors dark:text-zinc-100 dark:group-hover:text-violet-400">
              Sistema de Evaluación
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Clasificación y factores del pliego
            </p>
          </div>
        </a>
      </div>

      <ProposalsList analysisId={id} />
      <ProposalsComplianceChart analysisId={id} />
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  uppercase,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  uppercase?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide dark:text-zinc-500">
        {label}
      </span>
      {children ?? (
        <span
          className={`text-zinc-800 dark:text-zinc-200 ${mono ? "font-mono text-xs" : ""} ${uppercase ? "uppercase" : ""}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function AnalysisDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
        <div className="space-y-3 w-full">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  isSuccess,
}: {
  status: string;
  isSuccess: boolean | null;
}) {
  if (status === "processing")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1 w-fit dark:bg-blue-950 dark:text-blue-300">
        <Loader2 className="w-3 h-3 animate-spin" /> Procesando
      </span>
    );
  if (status === "pending")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 flex items-center gap-1 w-fit dark:bg-zinc-800 dark:text-zinc-400">
        <Clock className="w-3 h-3" /> Pendiente
      </span>
    );
  if (status === "awaiting_approval")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1 w-fit dark:bg-amber-950 dark:text-amber-300">
        <PauseCircle className="w-3 h-3" /> Esperando Aprobación
      </span>
    );
  if (status === "ready") {
    return isSuccess ? (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1 w-fit dark:bg-green-950 dark:text-green-300">
        <CheckCircle className="w-3 h-3" /> Completado
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1 w-fit dark:bg-red-950 dark:text-red-300">
        <XCircle className="w-3 h-3" /> Fallido
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center gap-1 w-fit">
      <AlertCircle className="w-3 h-3" /> Desconocido
    </span>
  );
}
