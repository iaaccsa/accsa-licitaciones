"use client";

import { useEffect, useState, useCallback } from "react";
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
  PauseCircle,
  Play,
  Scale,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import WorkflowPhases from "@/components/WorkflowPhases";
import ProposalsSummary from "@/components/ProposalsSummary";
import EconomicComparisonTable from "@/components/EconomicComparisonTable";

interface Analysis {
  id: string;
  slug: string;
  user_name: string | null;
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
  created_at: string;
  updated_at: string;
}

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

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const analysisRes = await fetch(`/api/analyses/${id}`);
        if (!analysisRes.ok) throw new Error("Error fetching analysis details");
        const analysisData = await analysisRes.json();
        setAnalysis(analysisData);
      } catch (err) {
        console.error(err);
        if (!silent) setError("No se pudo cargar la información del análisis.");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (id) fetchData();
  }, [id, fetchData]);

  // Poll while analysis is active
  useEffect(() => {
    if (!analysis) return;
    const isActive = ["pending", "processing", "awaiting_approval"].includes(
      analysis.status,
    );
    if (!isActive) return;

    const timer = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(timer);
  }, [analysis?.status, fetchData]);

  const handleCancel = useCallback(async () => {
    if (!analysis || isCancelling) return;
    const confirmed = window.confirm(
      "Esta acción no se puede deshacer. Los jobs en ejecución serán detenidos.",
    );
    if (!confirmed) return;
    setIsCancelling(true);
    setCancelMessage(null);
    try {
      const res = await fetch(`/api/analyses/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        setAnalysis((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setCancelMessage({
          type: "success",
          text: "Análisis cancelado correctamente.",
        });
      } else {
        setCancelMessage({
          type: "error",
          text: "Error al cancelar el análisis. Intenta nuevamente.",
        });
      }
    } catch {
      setCancelMessage({
        type: "error",
        text: "Error al cancelar el análisis. Intenta nuevamente.",
      });
    } finally {
      setIsCancelling(false);
    }
  }, [id, analysis, isCancelling]);

  const handleResume = useCallback(async () => {
    if (!analysis || isResuming) return;
    setIsResuming(true);
    try {
      const res = await fetch(`/api/analyses/${id}/resume`, { method: "POST" });
      if (res.ok) {
        setAnalysis((prev) =>
          prev
            ? { ...prev, status: "processing", paused_at_service: null }
            : prev,
        );
      }
    } catch (err) {
      console.error("Error resuming analysis:", err);
    } finally {
      setIsResuming(false);
    }
  }, [id, analysis, isResuming]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">Error</h2>
        <p className="text-zinc-600">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return <AnalysisDetailSkeleton />;
  }

  if (!analysis) return null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-zinc-900">
              {analysis.user_name || analysis.generated_name || (
                <span className="font-mono uppercase">{analysis.slug}</span>
              )}
            </h1>
            <StatusBadge
              status={analysis.status}
              isSuccess={analysis.is_success}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-zinc-500 gap-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(analysis.created_at)}
            </span>
            <span className="flex items-center gap-1 font-mono text-xs bg-zinc-100 px-2 py-0.5 rounded uppercase">
              {analysis.slug}
            </span>
          </div>
          {analysis.user_email && (
            <div className="flex items-center gap-1 text-sm text-zinc-500">
              <Mail className="w-4 h-4" />
              {analysis.user_email}
            </div>
          )}
          {(analysis.status === "pending" ||
            analysis.status === "processing" ||
            analysis.status === "awaiting_approval") && (
            <div className="flex items-center justify-end gap-2 pt-1">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isCancelling}
                className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                {isCancelling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </div>

      {cancelMessage && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${cancelMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          {cancelMessage.text}
        </div>
      )}

      {/* Workflow Phases */}
      <WorkflowPhases analysisId={id} />

      {/* Navigation Buttons */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <a
          href={`/analyses/${id}/files`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-documents-grouper" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <FileText className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors">
              Archivos
            </h3>
            <p className="text-sm text-zinc-500">
              Pliegos, normativas y ofertas
            </p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/requirements`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-green-300 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-requirement-extractor" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-green-50 text-green-600 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-green-600 transition-colors">
              Requisitos
            </h3>
            <p className="text-sm text-zinc-500">Ver requisitos</p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/admissibility`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-violet-300 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            analysis.paused_at_service === "service-requirement-extractor" && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-violet-50 text-violet-600 rounded-lg group-hover:bg-violet-600 group-hover:text-white transition-colors">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-violet-600 transition-colors">
              Admisibilidad
            </h3>
            <p className="text-sm text-zinc-500">Requisitos excluyentes</p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/proposals`}
          className="relative flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-orange-300 hover:shadow-md transition-all group text-center"
        >
          {analysis.status === "awaiting_approval" &&
            (analysis.paused_at_service === "service-compliance-matcher" ||
              analysis.paused_at_service === "service-admissibility-gate") && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            )}
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
            <Users className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-orange-600 transition-colors">
              Propuestas
            </h3>
            <p className="text-sm text-zinc-500">Propuestas y cumplimiento</p>
          </div>
        </a>

        <a
          href={`/analyses/${id}/evaluation_system`}
          className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group text-center"
        >
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Scale className="w-8 h-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-purple-600 transition-colors">
              Evaluación
            </h3>
            <p className="text-sm text-zinc-500">Sistema de evaluación</p>
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
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header Skeleton */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
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
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Procesando
      </span>
    );
  if (status === "pending")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 flex items-center gap-1">
        <Clock className="w-3 h-3" /> Pendiente
      </span>
    );
  if (status === "awaiting_approval")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
        <PauseCircle className="w-3 h-3" /> Esperando Aprovación
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-200 text-zinc-600 flex items-center gap-1">
        <Ban className="w-3 h-3" /> Cancelado
      </span>
    );
  if (status === "ready") {
    return isSuccess ? (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Completado
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
        <XCircle className="w-3 h-3" /> Fallido
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> Desconocido
    </span>
  );
}
