"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
    same_password: "La nueva contraseña debe ser distinta a la actual",
    weak_password: "La contraseña es demasiado débil",
    invalid_password_format: "La contraseña debe tener al menos 6 caracteres",
};

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
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                        <KeyRound className="h-6 w-6 text-blue-700" />
                    </div>
                    <CardTitle>Establecer contraseña</CardTitle>
                    <CardDescription>
                        Defina la contraseña con la que va a ingresar a la plataforma
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            autoFocus
                            required
                            minLength={6}
                            className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            placeholder="Nueva contraseña"
                            aria-label="Nueva contraseña"
                        />
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            disabled={loading}
                            required
                            minLength={6}
                            className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            placeholder="Confirmar contraseña"
                            aria-label="Confirmar contraseña"
                        />
                        {error && (
                            <p className="text-sm text-red-600 text-center" role="alert">
                                {error}
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading || !password || !confirm}
                        >
                            {loading ? "Guardando..." : "Guardar contraseña"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
