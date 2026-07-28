import { useMemo } from "react";
import { Check } from "lucide-react";

/**
 * AnalysisProgress
 * ----------------
 * Visualiza el progreso de un análisis como un stepper horizontal.
 *
 * Props:
 *  - stages: Array<{
 *      code: string,
 *      display_name: string,
 *      status: "pending" | "running" | "done",
 *      progress: number,          // 0..100
 *      order: number
 *    }>
 *  - title?: string               // default: "Progreso del análisis"
 *  - showApproval?: boolean       // default: true (muestra "Esperando Aprobación" entre etapas)
 *  - approvalLabels?: { idle, waiting, done }
 *  - className?: string           // clases extra para el contenedor raíz
 */
export default function AnalysisProgress({
    stages = [],
    title = "Progreso del análisis",
    showApproval = true,
    approvalLabels = {
        idle: "Esperando Aprobación",
        waiting: "Esperando Aprobación",
        done: "Aprobado",
    },
    className = "",
}) {
    const sorted = useMemo(
        () => [...stages].sort((a, b) => a.order - b.order),
        [stages]
    );

    const overall = useMemo(() => {
        if (!sorted.length) return 0;
        return Math.round(
            sorted.reduce((acc, s) => acc + (s.progress ?? 0), 0) / sorted.length
        );
    }, [sorted]);

    return (
        <div
            className={`w-full max-w-5xl mx-auto rounded-2xl border border-slate-700/40 bg-slate-900/60 backdrop-blur p-6 sm:p-8 shadow-2xl ${className}`}
        >
            <header className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
                    {title}
                </h2>
                <div className="text-sm text-slate-400">
                    Progreso global:{" "}
                    <strong className="text-slate-100 font-semibold">{overall}%</strong>
                </div>
            </header>

            {/* Barra global */}
            <div className="h-1.5 w-full rounded-full bg-slate-700/40 overflow-hidden mt-4 mb-10">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-all duration-700 ease-out"
                    style={{ width: `${overall}%` }}
                />
            </div>

            {/* Stepper */}
            <div className="flex items-start">
                {sorted.map((stage, idx) => {
                    const prev = sorted[idx - 1];
                    const uiStatus = normalizeStatus(stage);
                    const nextConnector = idx > 0 && showApproval;

                    return (
                        <FragmentKey key={stage.code}>
                            {nextConnector && (
                                <Connector
                                    prev={prev}
                                    current={stage}
                                    labels={approvalLabels}
                                />
                            )}
                            <Step stage={stage} uiStatus={uiStatus} index={idx} />
                        </FragmentKey>
                    );
                })}
            </div>
        </div>
    );
}

/* ---------- Subcomponentes ---------- */

function Step({ stage, uiStatus, index }) {
    const RING_R = 24;
    const CIRC = 2 * Math.PI * RING_R;
    const progress = clamp(stage.progress ?? 0, 0, 100);
    const dashOffset =
        uiStatus === "done" ? 0 : CIRC * (1 - progress / 100);

    const statusLabel = {
        running: "En curso",
        pending: "Pendiente",
        done: "Completado",
    }[uiStatus];

    const ringStroke =
        uiStatus === "done"
            ? "stroke-emerald-500"
            : uiStatus === "running"
                ? "stroke-sky-400"
                : "stroke-slate-600/60";

    const nodeBase =
        "relative w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors";
    const nodeStyle =
        uiStatus === "done"
            ? "bg-emerald-500 text-white"
            : uiStatus === "running"
                ? "bg-slate-900 text-sky-400 ring-4 ring-sky-400/15"
                : "bg-slate-800 text-slate-400";

    const statusColor =
        uiStatus === "done"
            ? "text-emerald-400"
            : uiStatus === "running"
                ? "text-sky-400"
                : "text-slate-500";

    return (
        <div className="flex flex-col items-center text-center w-[140px] sm:w-[170px] shrink-0">
            <div className="relative w-14 h-14 flex items-center justify-center">
                {/* Anillo de progreso */}
                <svg
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 56 56"
                    aria-hidden
                >
                    <circle
                        cx="28"
                        cy="28"
                        r={RING_R}
                        className="fill-none stroke-slate-700/50"
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

                {/* Pulso para etapa activa */}
                {uiStatus === "running" && (
                    <span className="absolute -inset-1.5 rounded-full border-2 border-sky-400/40 animate-ping" />
                )}

                {/* Nodo central */}
                <div className={`${nodeBase} ${nodeStyle}`}>
                    {uiStatus === "done" ? (
                        <Check className="w-5 h-5" strokeWidth={3} />
                    ) : (
                        index + 1
                    )}
                </div>
            </div>

            <div className="mt-3 text-xs sm:text-sm font-medium text-slate-200 leading-snug px-1">
                {stage.display_name}
            </div>
            <div
                className={`mt-1.5 text-[10px] uppercase tracking-wider font-semibold ${statusColor}`}
            >
                {statusLabel}
            </div>
            <div className="mt-1 text-xs font-semibold text-sky-400 min-h-[16px]">
                {uiStatus === "running" ? `${progress}%` : "\u00A0"}
            </div>
        </div>
    );
}

function Connector({ prev, current, labels }) {
    const prevDone = prev.status === "done" || (prev.progress ?? 0) >= 100;
    const currStarted =
        current.status !== "pending" || (current.progress ?? 0) > 0;

    let state = "idle";
    if (prevDone && currStarted) state = "done";
    else if (prevDone && !currStarted) state = "waiting";

    const lineFill =
        state === "done" ? "w-full bg-emerald-500" : "w-0 bg-emerald-500";

    const badgeStyle = {
        idle:
            "text-slate-400 border-slate-700/50 bg-slate-900/60",
        waiting:
            "text-amber-400 border-amber-400/40 bg-amber-400/10",
        done:
            "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    }[state];

    return (
        <div className="flex-1 flex flex-col items-center pt-[22px] min-w-[60px]">
            <div className="relative w-full h-[3px] rounded-full bg-slate-700/40">
                <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${lineFill}`}
                />
            </div>
            <div
                className={`mt-2.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${badgeStyle}`}
            >
                <span
                    className={`w-1.5 h-1.5 rounded-full bg-current ${state === "waiting" ? "animate-pulse" : ""
                        }`}
                />
                <span>{labels[state]}</span>
            </div>
        </div>
    );
}

// Fragment con key (React.Fragment admite key pero no se puede usar con la sintaxis <>)
function FragmentKey({ children }) {
    return <>{children}</>;
}

/* ---------- Helpers ---------- */

function normalizeStatus(stage) {
    if (stage.status === "done" || (stage.progress ?? 0) >= 100) return "done";
    if (stage.status === "running") return "running";
    return "pending";
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

/* ---------- Ejemplo de uso ----------

import AnalysisProgress from "./AnalysisProgress";

const stages = [
  { code: "processing",              display_name: "Procesamiento",                status: "running", progress: 72, order: 1 },
  { code: "requirement_extraction",  display_name: "Extracción de Requisitos",     status: "pending", progress: 0,  order: 2 },
  { code: "compliance_verification", display_name: "Verificación de Cumplimiento", status: "pending", progress: 0,  order: 3 },
];

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-800 p-8">
      <AnalysisProgress stages={stages} />
    </div>
  );
}

------------------------------------ */