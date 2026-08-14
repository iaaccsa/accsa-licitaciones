"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Loader2, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnalysisFailure {
  step_code: string;
  display_name: string;
  service_name: string | null;
  error_log: string | null;
  can_retry: boolean;
}

// What the system was doing when it broke, in the buyer's terms. The raw
// error_log never replaces this: it is a stack trace with internal URLs.
const STEP_FAILURE_COPY: Record<string, string> = {
  extractor:
    "El sistema no pudo abrir el paquete de documentos cargado. Puede que algún archivo esté dañado o que el formato no sea el esperado.",
  converter:
    "El sistema no pudo convertir los documentos a texto. Puede que alguno esté dañado o protegido.",
  documents_classifier:
    "El sistema no pudo clasificar los documentos entre pliegos, normativas y propuestas.",
  admissibility_extraction:
    "El sistema no pudo extraer los requisitos de admisibilidad del pliego.",
  build_proposal_index:
    "El sistema no pudo preparar los documentos de las propuestas para su revisión.",
  tender_classifier:
    "El sistema no pudo determinar el sistema de evaluación de la licitación a partir del pliego.",
  requirement_extraction:
    "El sistema no pudo extraer los otros requisitos del pliego.",
  compliance_matcher:
    "El sistema no pudo comparar los requisitos del pliego con los documentos de las propuestas.",
  compliance_summarizer:
    "El sistema no pudo generar el resumen de cumplimiento de las propuestas.",
};

const GENERIC_FAILURE_COPY =
  "El sistema se detuvo mientras procesaba el análisis y no pudo terminar.";

export default function AnalysisFailureNotice({
  analysisId,
  onRetried,
}: {
  analysisId: string;
  onRetried: () => void;
}) {
  const { data: failure } = useSWR<AnalysisFailure | null>(
    `/api/analyses/${analysisId}/failure`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!failure?.service_name || isRetrying) return;
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/retry-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_name: failure.service_name }),
      });
      if (res.ok) onRetried();
    } catch (err) {
      console.error("Error retrying step:", err);
    } finally {
      setIsRetrying(false);
    }
  }, [analysisId, failure, isRetrying, onRetried]);

  if (!failure) return null;

  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/40"
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300">
        <XCircle className="h-4 w-4 shrink-0" />
        El análisis no pudo completarse
      </p>
      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
        {STEP_FAILURE_COPY[failure.step_code] ?? GENERIC_FAILURE_COPY}{" "}
        <span className="opacity-80">
          Ocurrió en el paso &quot;{failure.display_name}&quot;.
        </span>
      </p>

      {failure.error_log && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-red-700 dark:text-red-400 hover:underline">
            Ver detalle técnico
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-red-100/70 p-3 font-mono text-[11px] leading-relaxed text-red-900 dark:bg-red-950 dark:text-red-200">
            {failure.error_log}
          </pre>
        </details>
      )}

      {failure.can_retry && (
        <Button
          size="sm"
          onClick={handleRetry}
          disabled={isRetrying}
          className="mt-3 bg-red-600 text-white hover:bg-red-700"
        >
          {isRetrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Reintentar desde este paso
        </Button>
      )}
    </div>
  );
}
