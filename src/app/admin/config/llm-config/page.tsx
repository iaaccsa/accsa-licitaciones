"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
    Brain,
    CheckCircle,
    Cpu,
    Gauge,
    Loader2,
    Sparkles,
    XCircle,
    Zap,
    type LucideIcon,
} from "lucide-react";

type PrimaryModel = "gemini" | "openai";
type IntelligenceLevel = "low" | "medium" | "high";

const MODELS: { value: PrimaryModel; label: string; desc: string; Icon: LucideIcon }[] = [
    { value: "gemini", label: "Gemini", desc: "Modelos de Google.", Icon: Sparkles },
    { value: "openai", label: "OpenAI", desc: "Modelos GPT de OpenAI.", Icon: Cpu },
];

const LEVELS: { value: IntelligenceLevel; label: string; desc: string; Icon: LucideIcon }[] = [
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

export default function LlmConfigPage() {
    const [primaryModel, setPrimaryModel] = useState<PrimaryModel>("openai");
    const [intelligenceLevel, setIntelligenceLevel] = useState<IntelligenceLevel>("medium");
    const [savedConfig, setSavedConfig] = useState<{
        primary_model: PrimaryModel;
        intelligence_level: IntelligenceLevel;
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
                setPrimaryModel(data.primary_model);
                setIntelligenceLevel(data.intelligence_level);
                setSavedConfig({
                    primary_model: data.primary_model,
                    intelligence_level: data.intelligence_level,
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
        (savedConfig.primary_model !== primaryModel ||
            savedConfig.intelligence_level !== intelligenceLevel);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setStatus("idle");
        setErrorMessage(null);
        try {
            const response = await fetch("/api/admin/llm-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    primary_model: primaryModel,
                    intelligence_level: intelligenceLevel,
                }),
            });
            const data = await response.json();
            if (response.ok) {
                setSavedConfig({
                    primary_model: data.primary_model,
                    intelligence_level: data.intelligence_level,
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
    }, [primaryModel, intelligenceLevel]);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <AdminPageHeader
                backHref="/admin/config"
                title="Configuración LLM"
                description="Configuración global del modelo. Aplica a los análisis que se creen a partir de ahora; los análisis en curso o existentes conservan el modelo con el que fueron creados."
            />

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
                {loading ? (
                    <div className="space-y-6">
                        <div>
                            <Skeleton className="h-4 w-32 mb-2" />
                            <div className="grid grid-cols-2 gap-4">
                                <Skeleton className="h-20 rounded-xl" />
                                <Skeleton className="h-20 rounded-xl" />
                            </div>
                        </div>
                        <div>
                            <Skeleton className="h-4 w-40 mb-2" />
                            <div className="grid grid-cols-3 gap-4">
                                <Skeleton className="h-20 rounded-xl" />
                                <Skeleton className="h-20 rounded-xl" />
                                <Skeleton className="h-20 rounded-xl" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-6">
                            <span className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                Modelo principal
                            </span>
                            <div className="grid grid-cols-2 gap-4">
                                {MODELS.map(({ value, label, desc, Icon }) => (
                                    <SelectableCard
                                        key={value}
                                        active={primaryModel === value}
                                        onClick={() => setPrimaryModel(value)}
                                        Icon={Icon}
                                        label={label}
                                        desc={desc}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <span className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                Nivel de inteligencia
                            </span>
                            <div className="grid grid-cols-3 gap-4">
                                {LEVELS.map(({ value, label, desc, Icon }) => (
                                    <SelectableCard
                                        key={value}
                                        active={intelligenceLevel === value}
                                        onClick={() => setIntelligenceLevel(value)}
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
