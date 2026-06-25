"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
    AlertTriangle,
    CheckCircle,
    Loader2,
    XCircle,
} from "lucide-react";

type FieldKey =
    | "qdrant_url"
    | "qdrant_api_key"
    | "openai_api_key"
    | "google_api_key"
    | "mistral_api_key";

type KeyStatus = { set: boolean; updated_at: string | null };
type InfraStatus = Record<FieldKey, KeyStatus>;

const FIELDS: { key: FieldKey; label: string; secret: boolean }[] = [
    { key: "qdrant_url", label: "Qdrant URL", secret: false },
    { key: "qdrant_api_key", label: "Qdrant API Key", secret: true },
    { key: "openai_api_key", label: "OpenAI API Key", secret: true },
    { key: "google_api_key", label: "Google (Gemini) API Key", secret: true },
    { key: "mistral_api_key", label: "Mistral API Key", secret: true },
];

const EMPTY_INPUTS: Record<FieldKey, string> = {
    qdrant_url: "",
    qdrant_api_key: "",
    openai_api_key: "",
    google_api_key: "",
    mistral_api_key: "",
};

function formatDate(value: string | null): string {
    if (!value) return "";
    try {
        return new Date(value).toLocaleString("es-CL", {
            dateStyle: "medium",
            timeStyle: "short",
        });
    } catch {
        return "";
    }
}

export default function InfraConfigPage() {
    const [status, setStatus] = useState<InfraStatus | null>(null);
    const [inputs, setInputs] = useState<Record<FieldKey, string>>(EMPTY_INPUTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/admin/infra-config");
                if (!response.ok) throw new Error("fetch failed");
                const data = (await response.json()) as InfraStatus;
                if (!cancelled) setStatus(data);
            } catch {
                if (!cancelled) {
                    setErrorMessage("No se pudo cargar la configuración.");
                    setSaveState("error");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const missing = useMemo(() => {
        if (!status) return [];
        return FIELDS.filter((f) => !status[f.key].set).map((f) => f.label);
    }, [status]);

    const hasChanges = useMemo(
        () => FIELDS.some((f) => inputs[f.key].length > 0),
        [inputs],
    );

    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveState("idle");
        setErrorMessage(null);
        try {
            const payload: Record<string, string> = {};
            for (const f of FIELDS) {
                if (inputs[f.key].length > 0) payload[f.key] = inputs[f.key];
            }
            const response = await fetch("/api/admin/infra-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (response.ok) {
                setStatus(data as InfraStatus);
                setInputs(EMPTY_INPUTS);
                setSaveState("success");
            } else {
                setErrorMessage(data.error || "No se pudo guardar la configuración.");
                setSaveState("error");
            }
        } catch {
            setErrorMessage("Error de conexión. Inténtelo después.");
            setSaveState("error");
        } finally {
            setSaving(false);
        }
    }, [inputs]);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <AdminPageHeader
                backHref="/admin/config"
                title="Credenciales de servicios"
                description="Credenciales de los proveedores que usan los microservicios del pipeline. Se guardan cifradas; nunca se muestran. Deje un campo vacío para no modificarlo."
            />

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
                {loading ? (
                    <div className="space-y-5">
                        {FIELDS.map((f) => (
                            <Skeleton key={f.key} className="h-16 rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <>
                        {missing.length > 0 ? (
                            <div className="flex items-start gap-2 mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                                <span>
                                    Faltan credenciales: {missing.join(", ")}. Los análisis
                                    fallarán hasta que se configuren.
                                </span>
                            </div>
                        ) : null}

                        <div className="space-y-5">
                            {FIELDS.map((f) => {
                                const keyStatus = status?.[f.key];
                                const isSet = keyStatus?.set ?? false;
                                return (
                                    <div key={f.key}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label
                                                htmlFor={f.key}
                                                className="text-sm font-medium text-zinc-700"
                                            >
                                                {f.label}
                                            </label>
                                            {isSet ? (
                                                <span className="text-xs text-green-600">
                                                    Configurado
                                                    {keyStatus?.updated_at
                                                        ? ` · actualizado ${formatDate(keyStatus.updated_at)}`
                                                        : ""}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-amber-600">
                                                    No configurado
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            id={f.key}
                                            type={f.secret ? "password" : "text"}
                                            autoComplete="new-password"
                                            value={inputs[f.key]}
                                            onChange={(e) =>
                                                setInputs((prev) => ({
                                                    ...prev,
                                                    [f.key]: e.target.value,
                                                }))
                                            }
                                            placeholder={
                                                isSet
                                                    ? "•••••••• (dejar vacío para no cambiar)"
                                                    : "Sin configurar"
                                            }
                                            className="w-full px-3 py-2.5 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {saveState === "success" ? (
                            <div className="flex items-center justify-center gap-2 mt-6 mb-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                                <CheckCircle className="h-5 w-5" />
                                <span>Configuración guardada con éxito.</span>
                            </div>
                        ) : null}

                        {saveState === "error" ? (
                            <div className="flex items-center justify-center gap-2 mt-6 mb-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                                <XCircle className="h-5 w-5" />
                                <span>{errorMessage || "No se pudo guardar la configuración."}</span>
                            </div>
                        ) : null}

                        <Button
                            onClick={handleSave}
                            variant="outline"
                            disabled={!hasChanges || saving}
                            className="w-full mt-6 py-6 text-lg font-medium text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
