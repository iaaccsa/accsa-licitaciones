"use client";

import { useState } from "react";
import { Trash2, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/AdminPageHeader";

type Status = "idle" | "confirm" | "loading" | "success" | "error";

export default function AdminCleanupPage() {
    const [status, setStatus] = useState<Status>("idle");
    const [result, setResult] = useState<string | null>(null);

    const runCleanup = async () => {
        setStatus("loading");
        setResult(null);
        try {
            const res = await fetch("/api/cleanup", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setStatus("success");
                setResult(JSON.stringify(data, null, 2));
            } else {
                setStatus("error");
                setResult(data.error || "Error al ejecutar la limpieza");
            }
        } catch {
            setStatus("error");
            setResult("Error de conexión");
        }
    };

    const loading = status === "loading";

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
            <AdminPageHeader
                backHref="/admin"
                title="Limpieza"
                description="Eliminación total de los datos del sistema."
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-4 h-4" />
                        Zona peligrosa
                    </CardTitle>
                    <CardDescription>
                        Esta acción elimina <strong>todos los análisis</strong> (junto con sus
                        archivos, propuestas, requisitos y eventos asociados), vacía los buckets de
                        almacenamiento y borra todas las colecciones de Qdrant. No se puede deshacer.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status === "confirm" ? (
                        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 space-y-3">
                            <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                ¿Seguro que desea eliminar todos los datos? Esta acción es irreversible.
                            </p>
                            <div className="flex gap-2">
                                <Button variant="destructive" onClick={runCleanup}>
                                    <Trash2 className="w-4 h-4" />
                                    Sí, eliminar todo
                                </Button>
                                <Button variant="outline" onClick={() => setStatus("idle")}>
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="destructive"
                            disabled={loading}
                            onClick={() => setStatus("confirm")}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            {loading ? "Ejecutando..." : "Ejecutar limpieza"}
                        </Button>
                    )}

                    {(status === "success" || status === "error") && result && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                {status === "success" ? (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                                            Limpieza completada
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                        <span className="text-sm font-semibold text-red-700 dark:text-red-300">Error</span>
                                    </>
                                )}
                            </div>
                            <pre
                                className={`whitespace-pre-wrap font-mono text-sm overflow-auto max-h-96 rounded-lg p-3 border ${
                                    status === "success"
                                        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900"
                                        : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
                                }`}
                            >
                                {result}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
