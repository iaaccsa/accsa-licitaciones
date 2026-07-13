"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { useParams } from "next/navigation";
import {
  Loader2,
  Calendar,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ClipboardList,
  Ban,
  Play,
  ShieldCheck,
  UserCheck,
  Bot,
  Cpu,
  Gauge,
  Pencil,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import WorkflowPhases from "@/components/WorkflowPhases";
import ProposalsSummary from "@/components/ProposalsSummary";
import EconomicComparisonTable from "@/components/EconomicComparisonTable";

interface Analysis {
  id: string;
  slug: string;
  user_assigned_name: string | null;
  generated_name: string | null;
  user_email: string | null;
  status:
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "awaiting_approval"
    | "cancelled";
  is_success: boolean | null;
  paused_at_service: string | null;
  hitl: boolean;
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

const CHIP_TONES = {
  neutral: "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
  indigo: "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900",
  violet: "bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-900",
  amber: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
} as const;

function InfoChip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label?: string;
  value: string;
  tone?: keyof typeof CHIP_TONES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${CHIP_TONES[tone]}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label && <span className="opacity-60">{label}</span>}
      <span className="font-medium">{value}</span>
    </span>
  );
}

const FINISHED_STATUSES = ["ready", "failed", "cancelled"];

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}

export default function AnalysisDetailPage() {
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const startEditName = useCallback(() => {
    if (!analysis) return;
    setNameDraft(analysis.user_assigned_name ?? "");
    setIsEditingName(true);
  }, [analysis]);

  const handleSaveName = useCallback(async () => {
    if (!analysis || isSavingName) return;
    setIsSavingName(true);
    try {
      const res = await fetch(`/api/analyses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_assigned_name: nameDraft }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = await res.json();
      if (analysis) {
        mutate(
          { ...analysis, user_assigned_name: updated.user_assigned_name ?? null },
          { revalidate: false },
        );
      }
      setIsEditingName(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingName(false);
    }
  }, [analysis, id, nameDraft, isSavingName, mutate]);

  const handleResume = useCallback(async () => {
    if (!analysis || isResuming) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/analyses/${id}/resume`, { method: "POST" });
      if (res.ok) {
        if (analysis) {
          mutate(
            { ...analysis, status: "processing", paused_at_service: null },
            { revalidate: false },
          );
        }
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
        <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
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
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <div className="flex flex-col gap-5">
          {/* Top: title block + status / actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                    maxLength={200}
                    placeholder={analysis.generated_name || analysis.slug}
                    className="flex-1 min-w-0 text-2xl font-bold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-zinc-300 dark:border-zinc-700 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    title="Guardar"
                    className="shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50"
                  >
                    {isSavingName ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Check className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    disabled={isSavingName}
                    title="Cancelar"
                    className="shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {analysis.user_assigned_name || analysis.generated_name || (
                      <span className="font-mono uppercase">{analysis.slug}</span>
                    )}
                  </h1>
                  <button
                    onClick={startEditName}
                    title="Editar nombre"
                    className="shrink-0 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono uppercase text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
                  {analysis.slug}
                </span>
                {analysis.user_assigned_name && analysis.generated_name && (
                  <span className="text-sm text-zinc-400 dark:text-zinc-500 truncate">
                    {analysis.generated_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge
                status={analysis.status}
                isSuccess={analysis.is_success}
              />
            </div>
          </div>

          <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

          {/* Metadata chips */}
          <div className="flex flex-wrap items-center gap-2">
            <InfoChip
              icon={Calendar}
              label="Creado"
              value={formatDate(analysis.created_at)}
            />
            <InfoChip
              icon={Clock}
              label={
                FINISHED_STATUSES.includes(analysis.status)
                  ? "Finalizado"
                  : "Actualizado"
              }
              value={formatDate(analysis.updated_at)}
            />
            <InfoChip
              icon={analysis.hitl ? UserCheck : Bot}
              value={
                analysis.hitl ? "Con validación humana" : "Sin validación humana"
              }
              tone={analysis.hitl ? "amber" : "neutral"}
            />
            {analysis.primary_model && (
              <InfoChip
                icon={Cpu}
                label="Modelo"
                value={
                  MODEL_LABELS[analysis.primary_model] ?? analysis.primary_model
                }
                tone="indigo"
              />
            )}
            {analysis.intelligence_level && (
              <InfoChip
                icon={Gauge}
                label="Inteligencia"
                value={
                  LEVEL_LABELS[analysis.intelligence_level] ??
                  analysis.intelligence_level
                }
                tone="violet"
              />
            )}
            {analysis.user_email && (
              <InfoChip icon={Mail} value={analysis.user_email} />
            )}
          </div>
        </div>
      </div>

      {/* Workflow Phases */}
      <WorkflowPhases
        analysisId={id}
        headerAction={
          analysis.status === "awaiting_approval" ? (
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
          ) : undefined
        }
      />

      {/* Navigation Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <a
          href={`/analyses/${id}/files`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-documents-grouper" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <FileText className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Archivos
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pliegos, normativas y ofertas
            </p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/admissibility-requirements`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-green-300 dark:hover:border-green-800 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-requirement-extractor" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
              Requisitos de Admisibilidad
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Excluyentes</p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/admissibility`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-violet-300 dark:hover:border-violet-800 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            (analysis.paused_at_service === "service-compliance-matcher" ||
              analysis.paused_at_service === "service-admissibility-gate") && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-colors">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              Admisibilidad
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Admisibilidad de propuestas</p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/requirements`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-green-300 dark:hover:border-green-800 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-requirement-extractor" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
              Otros Requisitos
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No excluyentes</p>
          </div>
        </a>
      </div>

      <ProposalsSummary analysisId={id} />

      <EconomicComparisonTable analysisId={id} />
    </div>
  );
}

function AnalysisDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Header Skeleton */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-3 w-full">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
        </div>
      </div>

      {/* Files Grid Skeleton */}
      <div className="grid md:grid-cols-3 gap-6">
        <Skeleton className="h-64 rounded-xl" />
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
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Procesando
      </span>
    );
  if (status === "pending")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
        <Clock className="w-3 h-3" /> Pendiente
      </span>
    );
  if (status === "awaiting_approval") return null;
  if (status === "cancelled")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
        <Ban className="w-3 h-3" /> Cancelado
      </span>
    );
  if (status === "ready") {
    return isSuccess ? (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Completado
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center gap-1">
        <XCircle className="w-3 h-3" /> Fallido
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> Desconocido
    </span>
  );
}
