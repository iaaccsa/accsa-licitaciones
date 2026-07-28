"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { fetcher } from "@/lib/swr";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [loggingOut, setLoggingOut] = useState(false);
    const { data } = useSWR<{ email: string }>("/api/auth/me", fetcher, {
        revalidateOnFocus: false,
    });
    const email = data?.email;

    if (!email) return null;

    const initials = email.split("@")[0].slice(0, 2).toUpperCase();
    const dark = theme === "dark";

    async function handleLogout() {
        setLoggingOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            router.replace("/login");
            router.refresh();
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Menú de usuario"
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-700 dark:text-zinc-100">
                        {initials}
                    </span>
                    <span className="hidden sm:inline text-sm text-zinc-700 dark:text-zinc-300">
                        {email}
                    </span>
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")}>
                    {dark ? <Sun /> : <Moon />}
                    {dark ? "Tema claro" : "Tema oscuro"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
                    <LogOut />
                    Salir
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
