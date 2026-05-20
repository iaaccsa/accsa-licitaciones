"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        setLoading(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            router.replace("/login");
            router.refresh();
        }
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
        >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
        </button>
    );
}
