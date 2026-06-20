"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    ArrowLeft,
    Bot,
    CheckCircle,
    Loader2,
    UserCheck,
    XCircle,
    type LucideIcon,
} from "lucide-react";

const OPTIONS: { value: boolean; label: string; desc: string; Icon: LucideIcon }[] = [
    {
        value: true,
        label: "Con validación humana",
        desc: "Pausa el análisis para aprobación manual.",
        Icon: UserCheck,
    },
    {
        value: false,
        label: "Sin validación humana",
        desc: "El análisis corre de principio a fin sin pausas.",
        Icon: Bot,
    },
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
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500"
                    : "border-zinc-200 hover:border-zinc-300"
            }`}
        >
            <Icon
                className={`h-5 w-5 mt-0.5 shrink-0 ${active ? "text-blue-600" : "text-zinc-400"}`}
            />
            <span>
                <span className="block text-sm font-medium text-zinc-700">{label}</span>
                <span className="block text-xs text-zinc-500 mt-0.5">{desc}</span>
            </span>
        </button>
    );
}

export default function HumanLoopPage() {
    const [hitl, setHitl] = useState(false);
    const [savedHitl, setSavedHitl] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/admin/human-loop");
                if (!response.ok) throw new Error("fetch failed");
                const data = await response.json();
                if (cancelled) return;
                setHitl(data.hitl);
                setSavedHitl(data.hitl);
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

    const hasChanges = savedHitl !== null && savedHitl !== hitl;

    const handleSave = useCallback(async () => {
        setSaving(true);
        setStatus("idle");
        setErrorMessage(null);
        try {
            const response = await fetch("/api/admin/human-loop", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hitl }),
            });
            const data = await response.json();
            if (response.ok) {
                setSavedHitl(data.hitl);
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
    }, [hitl]);

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="mb-6">
                <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
                <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                    Validación humana
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Configuración global. Aplica a los análisis que se creen a partir de
                    ahora; los análisis en curso o existentes conservan el modo con el que
                    fueron creados.
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
                {loading ? (
                    <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-20 rounded-xl" />
                        <Skeleton className="h-20 rounded-xl" />
                    </div>
                ) : (
                    <>
                        <div className="mb-6">
                            <span className="block text-sm font-medium text-zinc-600 mb-2">
                                Modo por defecto
                            </span>
                            <div className="grid grid-cols-2 gap-4">
                                {OPTIONS.map(({ value, label, desc, Icon }) => (
                                    <SelectableCard
                                        key={String(value)}
                                        active={hitl === value}
                                        onClick={() => setHitl(value)}
                                        Icon={Icon}
                                        label={label}
                                        desc={desc}
                                    />
                                ))}
                            </div>
                        </div>

                        {status === "success" ? (
                            <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                                <CheckCircle className="h-5 w-5" />
                                <span>Configuración guardada con éxito.</span>
                            </div>
                        ) : null}

                        {status === "error" ? (
                            <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                                <XCircle className="h-5 w-5" />
                                <span>{errorMessage || "No se pudo guardar la configuración."}</span>
                            </div>
                        ) : null}

                        <Button
                            onClick={handleSave}
                            variant="outline"
                            disabled={!hasChanges || saving}
                            className="w-full py-6 text-lg font-medium text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
