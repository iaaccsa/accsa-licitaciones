"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Check, AlertTriangle } from "lucide-react";

interface Phase {
  id: string;
  analysis_id: string;
  code: string;
  display_name: string;
  type: "processing" | "approval";
  status: "pending" | "running" | "completed" | "failed" | "warning";
  progress: number;
  order: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
}

interface WorkflowPhasesProps {
  analysisId: string;
}

type UiStatus = "done" | "running" | "pending" | "warning";

const RING_R = 24;
const CIRC = 2 * Math.PI * RING_R;

function normalizeStatus(phase: Phase): UiStatus {
  if (phase.status === "warning") return "warning";
  if (phase.status === "completed" || phase.progress >= 100) return "done";
  if (phase.status === "running") return "running";
  return "pending";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function Step({ stage, index }: { stage: Phase; index: number }) {
  const uiStatus = normalizeStatus(stage);
  const progress = clamp(stage.progress ?? 0, 0, 100);
  const dashOffset =
    uiStatus === "done" || uiStatus === "warning"
      ? 0
      : CIRC * (1 - progress / 100);

  const statusLabel: Record<UiStatus, string> = {
    running: "En curso",
    pending: "Pendiente",
    done: "Completado",
    warning: "Sin admisibles",
  };

  const ringStroke =
    uiStatus === "done"
      ? "stroke-green-500"
      : uiStatus === "warning"
        ? "stroke-amber-400"
        : uiStatus === "running"
          ? "stroke-sky-400"
          : "stroke-zinc-200";

  const nodeStyle =
    uiStatus === "done"
      ? "bg-green-600 text-white"
      : uiStatus === "warning"
        ? "bg-amber-500 text-white"
        : uiStatus === "running"
          ? "bg-white text-sky-500 ring-4 ring-sky-100"
          : "bg-zinc-100 text-zinc-400";

  const statusColor =
    uiStatus === "done"
      ? "text-green-600"
      : uiStatus === "warning"
        ? "text-amber-600"
        : uiStatus === "running"
          ? "text-sky-500"
          : "text-zinc-400";

  return (
    <div className="flex flex-col items-center text-center w-[140px] sm:w-[170px] shrink-0">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 56 56"
          aria-hidden
        >
          <circle
            cx="28"
            cy="28"
            r={RING_R}
            className="fill-none stroke-zinc-100"
            strokeWidth="4"
          />
          <circle
            cx="28"
            cy="28"
            r={RING_R}
            className={`fill-none ${ringStroke} transition-[stroke-dashoffset] duration-700 ease-out`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
          />
        </svg>

        {uiStatus === "running" && (
          <span className="absolute -inset-1.5 rounded-full border-2 border-sky-400/40 animate-ping" />
        )}

        <div
          className={`relative w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${nodeStyle}`}
        >
          {uiStatus === "done" ? (
            <Check className="w-5 h-5" strokeWidth={3} />
          ) : uiStatus === "warning" ? (
            <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
          ) : (
            index + 1
          )}
        </div>
      </div>

      <div className="mt-3 text-xs sm:text-sm font-medium text-zinc-700 leading-snug px-1">
        {stage.display_name}
      </div>
      <div
        className={`mt-1.5 text-[10px] uppercase tracking-wider font-semibold ${statusColor}`}
      >
        {statusLabel[uiStatus]}
      </div>
    </div>
  );
}

function Connector({
  prev,
  current,
  approvalPhase,
}: {
  prev: Phase;
  current: Phase;
  approvalPhase?: Phase;
}) {
  const prevDone = prev.status === "completed" || prev.progress >= 100;
  const currStarted = current.status !== "pending" || current.progress > 0;
  const isAuto =
    approvalPhase?.display_name?.startsWith("Sin aprobación") ?? false;
  const approvalDone = approvalPhase
    ? approvalPhase.status === "completed" || approvalPhase.progress >= 100
    : false;

  let state: "idle" | "waiting" | "done" = "idle";
  if (isAuto || approvalDone) state = "done";
  else if (prevDone && currStarted) state = "done";
  else if (prevDone && !currStarted) state = "waiting";

  const badgeStyle = {
    idle: "text-zinc-400 border-zinc-200 bg-zinc-50",
    waiting: "text-amber-600 border-amber-300 bg-amber-50",
    done: "text-green-600 border-green-300 bg-green-50",
  }[state];

  const label = isAuto
    ? "Aprobado por la IA"
    : state === "done"
      ? "Aprobado"
      : "Esperando Aprobación";

  return (
    <div className="flex-1 flex flex-col items-center pt-[22px] min-w-[60px]">
      <div className="relative w-full h-[3px] rounded-full bg-zinc-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${state === "done" ? "w-full bg-green-500" : "w-0"}`}
        />
      </div>
      {/* HOTL (auto-approval): hide the intermediate approval state entirely. */}
      {!isAuto && (
        <div className="relative mt-2.5">
          {state === "waiting" && (
            <span className="absolute inset-0 rounded-full border-2 border-amber-400/40 animate-ping" />
          )}
          <div
            className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${badgeStyle}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full bg-current ${state === "waiting" ? "animate-pulse" : ""}`}
            />
            <span>{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentKey({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function WorkflowPhases({ analysisId }: WorkflowPhasesProps) {
  const { data: phases = [], isLoading } = useSWR<Phase[]>(
    analysisId ? `/api/analyses/${analysisId}/phases` : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: false },
  );

  const sorted = useMemo(
    () =>
      [...phases]
        .filter((p) => p.type === "processing")
        .sort((a, b) => a.order - b.order),
    [phases],
  );

  const approvalPhases = useMemo(
    () =>
      [...phases]
        .filter((p) => p.type === "approval")
        .sort((a, b) => a.order - b.order),
    [phases],
  );

  const overall = useMemo(() => {
    if (!sorted.length) return 0;
    return Math.round(
      sorted.reduce((acc, s) => acc + (s.progress ?? 0), 0) / sorted.length,
    );
  }, [sorted]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="h-4 w-40 bg-zinc-100 rounded animate-pulse mb-6" />
        <div className="flex items-center gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-zinc-100 animate-pulse" />
              <div className="h-3 w-20 bg-zinc-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
          Progreso del análisis
        </h2>
        <div className="text-sm text-zinc-500">
          Progreso global:{" "}
          <strong className="text-zinc-900 font-semibold">{overall}%</strong>
        </div>
      </header>

      <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden mt-4 mb-10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-700 ease-out"
          style={{ width: `${overall}%` }}
        />
      </div>

      <div className="flex items-start">
        {sorted.map((stage, idx) => {
          const prev = sorted[idx - 1];
          const showConnector = idx > 0;
          const approvalBetween = showConnector
            ? approvalPhases.find(
                (a) => a.order > prev.order && a.order < stage.order,
              )
            : undefined;

          return (
            <FragmentKey key={stage.code}>
              {showConnector && (
                <Connector
                  prev={prev}
                  current={stage}
                  approvalPhase={approvalBetween}
                />
              )}
              <Step stage={stage} index={idx} />
            </FragmentKey>
          );
        })}
      </div>
    </div>
  );
}
