"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 text-center max-w-md w-full">
                <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                </div>

                <h2 className="text-2xl font-semibold text-zinc-900 mb-3">
                    Algo salió mal
                </h2>

                <p className="text-zinc-500 mb-8 leading-relaxed">
                    Lo sentimos, ha ocurrido un error inesperado al procesar tu solicitud.
                    Nuestro equipo ha sido notificado.
                </p>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={reset}
                        className="flex items-center justify-center gap-2 w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Intentar nuevamente
                    </button>

                    <button
                        onClick={() => window.location.href = "/"}
                        className="text-zinc-500 hover:text-zinc-700 text-sm font-medium py-2"
                    >
                        Volver al inicio
                    </button>
                </div>

                {process.env.NODE_ENV === "development" && (
                    <div className="mt-8 pt-6 border-t border-zinc-100 text-left">
                        <p className="text-xs font-mono text-red-500 break-all bg-red-50 p-3 rounded">
                            {error.message}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
