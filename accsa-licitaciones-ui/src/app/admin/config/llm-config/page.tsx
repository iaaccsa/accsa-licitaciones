"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
    Brain,
    CheckCircle,
    CircleOff,
    Cpu,
    Gauge,
    Loader2,
    Minimize2,
    Rocket,
    Sparkles,
    XCircle,
    Zap,
    type LucideIcon,
} from "lucide-react";

type OpenAiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

// Values verified against each provider's API: OpenAI takes none..xhigh on
// chat.completions and rejects "minimal"; Gemini takes minimal..high on
// thinking_level and has no "off". Both default to "medium".
const OPENAI_EFFORTS: { value: OpenAiReasoningEffort; label: string; desc: string; Icon: LucideIcon }[] = [
    { value: "none", label: "Ninguno", desc: "Sin razonamiento.", Icon: CircleOff },
    { value: "low", label: "Bajo", desc: "Más rápido y económico.", Icon: Zap },
    { value: "medium", label: "Medio", desc: "Equilibrio velocidad/calidad.", Icon: Gauge },
    { value: "high", label: "Alto", desc: "Más capaz, más lento.", Icon: Brain },
    { value: "xhigh", label: "Máximo", desc: "El más capaz, el más caro.", Icon: Rocket },
];

const GEMINI_LEVELS: { value: GeminiThinkingLevel; label: string; desc: string; Icon: LucideIcon }[] = [
    { value: "minimal", label: "Mínimo", desc: "El menor razonamiento posible.", Icon: Minimize2 },
    { value: "low", label: "Bajo", desc: "Más rápido y económico.", Icon: Zap },
    { value: "medium", label: "Medio", desc: "Equilibrio velocidad/calidad.", Icon: Gauge },
    { value: "high", label: "Alto", desc: "Más capaz, más lento.", Icon: Brain },
];

function SelectableCard({
    active,
    onClick,
    Icon,
    label,
    desc,
}: {
    active: boolean;
    onClick: () => void;
    Icon: LucideIcon;
    label: string;
    desc: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                active
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
        >
            <Icon
                className={`h-5 w-5 mt-0.5 shrink-0 ${active ? "text-blue-600 dark:text-blue-400" : "text-zinc-400 dark:text-zinc-500"}`}
            />
            <span>
                <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</span>
            </span>
        </button>
    );
}

function ModelHeader({
    Icon,
    role,
    provider,
    model,
    note,
}: {
    Icon: LucideIcon;
    role: string;
    provider: string;
    model: string;
    note: string;
}) {
    return (
        <div className="flex items-start gap-3 mb-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
            </span>
            <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{role}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{provider}</span>
                    <code className="text-sm font-mono text-zinc-900 dark:text-zinc-100">{model}</code>
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1">{note}</span>
            </span>
        </div>
    );
}

export default function LlmConfigPage() {
    const [openaiEffort, setOpenaiEffort] = useState<OpenAiReasoningEffort>("medium");
    const [geminiLevel, setGeminiLevel] = useState<GeminiThinkingLevel>("medium");
    const [savedConfig, setSavedConfig] = useState<{
        openai_reasoning_effort: OpenAiReasoningEffort;
        gemini_thinking_level: GeminiThinkingLevel;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/admin/llm-config");
                if (!response.ok) throw new Error("fetch failed");
                const data = await response.json();
                if (cancelled) return;
                setOpenaiEffort(data.openai_reasoning_effort);
                setGeminiLevel(data.gemini_thinking_level);
                setSavedConfig({
                    openai_reasoning_effort: data.openai_reasoning_effort,
                    gemini_thinking_level: data.gemini_thinking_level,
                });
            } catch {
                if (!cancelled) {
                    setErrorMessage("No se pudo cargar la configuración.");
                    setStatus("error");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const hasChanges =
        savedConfig !== null &&
        (savedConfig.openai_reasoning_effort !== openaiEffort ||
            savedConfig.gemini_thinking_level !== geminiLevel);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setStatus("idle");
        setErrorMessage(null);
        try {
            const response = await fetch("/api/admin/llm-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    openai_reasoning_effort: openaiEffort,
                    gemini_thinking_level: geminiLevel,
                }),
            });
            const data = await response.json();
            if (response.ok) {
                setSavedConfig({
                    openai_reasoning_effort: data.openai_reasoning_effort,
                    gemini_thinking_level: data.gemini_thinking_level,
                });
                setStatus("success");
            } else {
                setErrorMessage(data.error || "No se pudo guardar la configuración.");
                setStatus("error");
            }
        } catch {
            setErrorMessage("Error de conexión. Inténtelo después.");
            setStatus("error");
        } finally {
            setSaving(false);
        }
    }, [openaiEffort, geminiLevel]);

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <AdminPageHeader
                backHref="/admin/config"
                title="Configuración LLM"
                description="Razonamiento de los modelos que usa el pipeline. Aplica a los análisis que se creen a partir de ahora; los análisis en curso o existentes conservan la configuración con la que fueron creados."
            />

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
                {loading ? (
                    <div className="space-y-8">
                        <div>
                            <Skeleton className="h-10 w-64 mb-4" />
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Skeleton key={i} className="h-20 rounded-xl" />
                                ))}
                            </div>
                        </div>
                        <div>
                            <Skeleton className="h-10 w-64 mb-4" />
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-20 rounded-xl" />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-8">
                            <ModelHeader
                                Icon={Cpu}
                                role="Modelo principal"
                                provider="OpenAI"
                                model="gpt-5.6-terra"
                                note="Nivel de esfuerzo de razonamiento."
                            />
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                {OPENAI_EFFORTS.map(({ value, label, desc, Icon }) => (
                                    <SelectableCard
                                        key={value}
                                        active={openaiEffort === value}
                                        onClick={() => setOpenaiEffort(value)}
                                        Icon={Icon}
                                        label={label}
                                        desc={desc}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="mb-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
                            <ModelHeader
                                Icon={Sparkles}
                                role="Modelo secundario"
                                provider="Google"
                                model="gemini-3.6-flash"
                                note="Nivel de razonamiento. No admite desactivarlo: el mínimo es Mínimo."
                            />
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {GEMINI_LEVELS.map(({ value, label, desc, Icon }) => (
                                    <SelectableCard
                                        key={value}
                                        active={geminiLevel === value}
                                        onClick={() => setGeminiLevel(value)}
                                        Icon={Icon}
                                        label={label}
                                        desc={desc}
                                    />
                                ))}
                            </div>
                        </div>

                        {status === "success" ? (
                            <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl text-green-700 dark:text-green-300">
                                <CheckCircle className="h-5 w-5" />
                                <span>Configuración guardada con éxito.</span>
                            </div>
                        ) : null}

                        {status === "error" ? (
                            <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300">
                                <XCircle className="h-5 w-5" />
                                <span>{errorMessage || "No se pudo guardar la configuración."}</span>
                            </div>
                        ) : null}

                        <Button
                            onClick={handleSave}
                            variant="outline"
                            disabled={!hasChanges || saving}
                            className="w-full py-6 text-lg font-medium text-blue-600 dark:text-blue-400 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                "Guardar"
                            )}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
