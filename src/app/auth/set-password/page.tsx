"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
    same_password: "La nueva contraseña debe ser distinta a la actual",
    weak_password: "La contraseña es demasiado débil",
    invalid_password_format: "La contraseña debe tener al menos 6 caracteres",
};

const inputClass =
    "w-full h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:focus:ring-zinc-100/20 dark:focus:border-zinc-500";

export default function SetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        if (password !== confirm) {
            setError("Las contraseñas no coinciden");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/set-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                router.replace("/");
                router.refresh();
                return;
            }
            const data = await res.json().catch(() => null);
            setError(
                ERROR_MESSAGES[data?.error as string] ??
                    "No se pudo establecer la contraseña. Intente nuevamente."
            );
        } catch {
            setError("Error de red. Intente nuevamente.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-zinc-200 dark:bg-zinc-950 px-4">
            <Card className="w-full max-w-md py-8">
                <CardHeader className="px-8">
                    <CardTitle className="text-lg font-medium">Establecer contraseña</CardTitle>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Define la contraseña con la que vas a ingresar a la plataforma
                    </p>
                </CardHeader>
                <CardContent className="px-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label
                                htmlFor="new-password"
                                className="block text-sm text-zinc-900 dark:text-zinc-200"
                            >
                                Nueva contraseña
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                autoFocus
                                required
                                minLength={6}
                                className={inputClass}
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="confirm-password"
                                className="block text-sm text-zinc-900 dark:text-zinc-200"
                            >
                                Confirmar contraseña
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                disabled={loading}
                                required
                                minLength={6}
                                className={inputClass}
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                                {error}
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="w-full h-11 rounded-lg dark:border dark:border-zinc-600 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
                            disabled={loading}
                        >
                            {loading ? "Guardando..." : "Guardar contraseña"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
