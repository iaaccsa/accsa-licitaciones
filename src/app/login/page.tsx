"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

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
                setError("Email o contraseña incorrectos");
            }
            setPassword("");
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
                        <Lock className="h-6 w-6 text-blue-700" />
                    </div>
                    <CardTitle>Acceso restringido</CardTitle>
                    <CardDescription>Ingrese su email y contraseña para continuar</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            autoFocus
                            required
                            className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            placeholder="Email"
                            aria-label="Email"
                        />
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            required
                            className="w-full h-10 px-3 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            placeholder="Contraseña"
                            aria-label="Contraseña"
                        />
                        {error && (
                            <p className="text-sm text-red-600 text-center" role="alert">
                                {error}
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading || !email || !password}
                        >
                            {loading ? "Verificando..." : "Ingresar"}
                        </Button>
                    </form>
                    <p className="mt-6 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-500">
                        ¿No tiene una cuenta? El acceso al sistema es solo por
                        invitación. Las cuentas nuevas las crea un administrador.
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
