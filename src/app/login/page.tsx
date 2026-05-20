"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pin, setPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!/^\d{8}$/.test(pin)) {
            setError("El PIN debe tener 8 dígitos");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin }),
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
                setError("PIN incorrecto");
            }
            setPin("");
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
                    <CardDescription>Ingrese su PIN de 8 dígitos para continuar</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            pattern="\d{8}"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            disabled={loading}
                            autoFocus
                            className="w-full text-center tracking-[0.5em] text-2xl font-mono h-14 rounded-md border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            placeholder="••••••••"
                            aria-label="PIN"
                        />
                        {error && (
                            <p className="text-sm text-red-600 text-center" role="alert">
                                {error}
                            </p>
                        )}
                        <Button type="submit" className="w-full" disabled={loading || pin.length !== 8}>
                            {loading ? "Verificando..." : "Ingresar"}
                        </Button>
                    </form>
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
