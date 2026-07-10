"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
    ArrowLeft,
    CheckCircle,
    FileText,
    Loader2,
    XCircle,
} from "lucide-react";

type ServicePrompt = {
    id: string;
    key: string;
    service: string;
    filename: string;
    title: string;
    description: string;
    body: string;
    required_placeholders: string[];
    updated_at: string | null;
    updated_by: string | null;
};

export default function PromptsPage() {
    const [prompts, setPrompts] = useState<ServicePrompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/admin/prompts");
                if (!response.ok) throw new Error("fetch failed");
                const data = (await response.json()) as ServicePrompt[];
                if (!cancelled) setPrompts(data);
            } catch {
                if (!cancelled) setLoadError("No se pudieron cargar los prompts.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const selected = useMemo(
        () => prompts.find((p) => p.key === selectedKey) ?? null,
        [prompts, selectedKey]
    );

    const missing = useMemo(() => {
        if (!selected) return [];
        return selected.required_placeholders.filter((p) => !draft.includes(`{${p}}`));
    }, [selected, draft]);

    const hasChanges = selected !== null && draft !== selected.body;

    const openEditor = useCallback((p: ServicePrompt) => {
        setSelectedKey(p.key);
        setDraft(p.body);
        setStatus("idle");
        setErrorMessage(null);
    }, []);

    const closeEditor = useCallback(() => {
        setSelectedKey(null);
        setStatus("idle");
        setErrorMessage(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!selected) return;
        setSaving(true);
        setStatus("idle");
        setErrorMessage(null);
        try {
            const response = await fetch(
                `/api/admin/prompts/${selected.key}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: draft }),
                }
            );
            const data = await response.json().catch(() => null);
            if (response.ok) {
                setPrompts((prev) =>
                    prev.map((p) =>
                        p.key === selected.key
                            ? { ...p, body: data?.body ?? draft, updated_at: data?.updated_at ?? p.updated_at }
                            : p
                    )
                );
                setStatus("success");
            } else if (response.status === 422) {
                const miss: string[] = data?.detail?.missing ?? [];
                setErrorMessage(
                    miss.length
                        ? `Faltan placeholders obligatorios: ${miss.map((m) => `{${m}}`).join(", ")}`
                        : "Validación fallida."
                );
                setStatus("error");
            } else {
                setErrorMessage(data?.error || "No se pudo guardar el prompt.");
                setStatus("error");
            }
        } catch {
            setErrorMessage("Error de conexión. Inténtelo después.");
            setStatus("error");
        } finally {
            setSaving(false);
        }
    }, [selected, draft]);

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <AdminPageHeader
                backHref="/admin/config"
                title="Prompts de los servicios"
                description="Editá el texto de los prompts. Los cambios aplican en la próxima corrida del pipeline; los análisis en curso no se ven afectados."
            />

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-2xl" />
                    ))}
                </div>
            ) : loadError ? (
                <div className="flex items-center justify-center gap-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300">
                    <XCircle className="h-5 w-5" />
                    <span>{loadError}</span>
                </div>
            ) : selected ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8">
                    <button
                        type="button"
                        onClick={closeEditor}
                        className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Todos los prompts
                    </button>

                    <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200">{selected.title}</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selected.description}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 font-mono">{selected.key}</p>

                    {selected.required_placeholders.length > 0 ? (
                        <div className="mt-4">
                            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                Placeholders obligatorios
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {selected.required_placeholders.map((p) => {
                                    const present = draft.includes(`{${p}}`);
                                    return (
                                        <span
                                            key={p}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono border ${
                                                present
                                                    ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300"
                                                    : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
                                            }`}
                                        >
                                            {present ? (
                                                <CheckCircle className="h-3 w-3" />
                                            ) : (
                                                <XCircle className="h-3 w-3" />
                                            )}
                                            {`{${p}}`}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                        className="mt-4 w-full h-[28rem] p-4 rounded-xl dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 font-mono text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                    />

                    {status === "success" ? (
                        <div className="flex items-center justify-center gap-2 mt-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl text-green-700 dark:text-green-300">
                            <CheckCircle className="h-5 w-5" />
                            <span>Prompt guardado con éxito.</span>
                        </div>
                    ) : null}

                    {status === "error" ? (
                        <div className="flex items-center justify-center gap-2 mt-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300">
                            <XCircle className="h-5 w-5" />
                            <span>{errorMessage || "No se pudo guardar el prompt."}</span>
                        </div>
                    ) : null}

                    {missing.length > 0 ? (
                        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                            Faltan placeholders obligatorios:{" "}
                            <span className="font-mono">
                                {missing.map((m) => `{${m}}`).join(", ")}
                            </span>
                        </p>
                    ) : null}

                    <Button
                        onClick={handleSave}
                        variant="outline"
                        disabled={!hasChanges || saving || missing.length > 0}
                        className="w-full mt-4 py-6 text-lg font-medium text-blue-600 dark:text-blue-400 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {prompts.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => openEditor(p)}
                            className="flex flex-col items-start gap-2 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left shadow-sm transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow"
                        >
                            <span className="inline-flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
                                <FileText className="h-4 w-4" />
                                <span className="text-xs font-mono">{p.service}</span>
                            </span>
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{p.title}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{p.description}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
