"use client";

import { useState } from "react";
import { Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function CleanupButton() {
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [result, setResult] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);

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
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false);
        setStatus("idle");
        setResult(null);
    };

    return (
        <>
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

            {showModal && result && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4">
                        <div className="flex items-center gap-2 px-6 py-4 border-b border-zinc-200">
                            {status === "success" ? (
                                <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="font-semibold text-green-700">Completado</span></>
                            ) : (
                                <><XCircle className="w-4 h-4 text-red-600" /><span className="font-semibold text-red-700">Error</span></>
                            )}
                        </div>
                        <div className="px-6 py-4">
                            <pre className={`whitespace-pre-wrap font-mono text-sm overflow-auto max-h-60 rounded-lg p-3 border ${status === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>{result}</pre>
                        </div>
                        <div className="flex justify-end px-6 py-4 border-t border-zinc-200">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-zinc-800 text-white text-sm font-medium rounded-lg hover:bg-zinc-700 transition-colors"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
