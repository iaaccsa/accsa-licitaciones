"use client";

import { useState } from "react";
import { Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function CleanupButton() {
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [result, setResult] = useState<string | null>(null);

    const handleCleanup = async () => {
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
                setResult(data.error || "Error al ejecutar cleanup");
            }
        } catch {
            setStatus("error");
            setResult("Error de conexión");
        }
    };

    return (
        <div className="space-y-3">
            <button
                onClick={handleCleanup}
                disabled={status === "loading"}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {status === "loading" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Trash2 className="w-4 h-4" />
                )}
                Cleanup
            </button>

            {result && (
                <div className={`rounded-lg p-4 font-mono text-sm overflow-auto max-h-60 border ${status === "success"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                    }`}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider">
                        {status === "success" ? (
                            <><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> <span className="text-green-700">Completado</span></>
                        ) : (
                            <><XCircle className="w-3.5 h-3.5 text-red-600" /> <span className="text-red-700">Error</span></>
                        )}
                    </div>
                    <pre className="whitespace-pre-wrap">{result}</pre>
                </div>
            )}
        </div>
    );
}
