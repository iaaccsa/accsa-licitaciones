"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export function Footer() {
    const pathname = usePathname();
    if (pathname === "/login" || pathname.startsWith("/auth")) return null;

    return (
        <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mt-auto">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Image
                        src="/images/logo-square.png"
                        alt="Logo"
                        width={22}
                        height={22}
                        className="rounded"
                    />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-serif italic">
                        Asistente de Compras Estatales
                    </span>
                    <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        © {new Date().getFullYear()}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        href="/changelog"
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors tabular-nums"
                    >
                        v{process.env.NEXT_PUBLIC_APP_VERSION}
                    </Link>
                    <Link
                        href="/terms"
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                    >
                        Términos y Condiciones
                    </Link>
                </div>
            </div>
        </footer>
    );
}
