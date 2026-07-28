"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// Theme is unknown during SSR; render the light icon until hydration so
// server and client markup match.
const emptySubscribe = () => () => {};
function useHydrated() {
    return useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );
}

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const hydrated = useHydrated();

    const dark = hydrated && resolvedTheme === "dark";

    return (
        <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Cambiar tema"
            title="Cambiar tema"
        >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
