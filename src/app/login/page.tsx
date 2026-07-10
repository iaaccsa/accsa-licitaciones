"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const inputClass =
    "w-full h-10 px-3 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:focus:ring-zinc-100/20 dark:focus:border-zinc-500";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(() =>
        searchParams.get("error") === "invalid_link"
            ? "El enlace de invitación no es válido o expiró. Pida que le reenvíen la invitación."
            : null
    );
    const [loading, setLoading] = useState(false);
    const [showResetInfo, setShowResetInfo] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (res.ok) {
                const next = searchParams.get("next") || "/";
                router.replace(next);
                router.refresh();
                return;
            }
            if (res.status === 429) {
                setError("Demasiados intentos. Espere unos minutos.");
            } else {
                setError("Usuario o contraseña incorrectos");
            }
            setPassword("");
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
                    <CardTitle className="text-lg font-medium">Iniciar Sesión</CardTitle>
                </CardHeader>
                <CardContent className="px-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="email" className="block text-sm text-zinc-900 dark:text-zinc-200">
                                Usuario
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                autoFocus
                                required
                                className={inputClass}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="password" className="block text-sm text-zinc-900 dark:text-zinc-200">
                                Contraseña
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                required
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <button
                                type="button"
                                onClick={() => setShowResetInfo((v) => !v)}
                                className="text-sm text-zinc-900 dark:text-zinc-200 hover:underline"
                            >
                                ¿Olvidaste tu contraseña?
                            </button>
                            {showResetInfo && (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    Comunícate con el administrador de tu organización para
                                    restablecerla.
                                </p>
                            )}
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
                            {loading ? "Verificando..." : "Iniciar Sesión"}
                        </Button>
                    </form>
                    <p className="mt-6 text-sm leading-relaxed">
                        <span className="text-zinc-500 dark:text-zinc-200">
                            ¿No tienes una cuenta?{" "}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-500">
                            Comunícate con el administrador de tu organización para crear una
                        </span>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
