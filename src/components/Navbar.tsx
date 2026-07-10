"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

const navItems = [
    { href: "/", label: "Análisis" },
    { href: "/ayuda", label: "Ayuda" },
    { href: "/admin", label: "Admin" },
] as const;

export function Navbar() {
    const pathname = usePathname();
    // Unauthenticated/onboarding pages get a brand-only bar with the theme toggle.
    const minimal = pathname === "/login" || pathname.startsWith("/auth");

    return (
        <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4">
                <div className="relative flex items-center h-14">
                    {/* Logo / Brand */}
                    <Link
                        href="/"
                        className="flex items-center gap-2 shrink-0"
                    >
                        <Image
                            src="/images/logo-square.png"
                            alt="Logo"
                            width={32}
                            height={32}
                            className="rounded"
                        />
                        <span className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 font-serif italic">
                            Asistente de Compras Estatales
                        </span>
                    </Link>

                    {minimal ? (
                        <div className="ml-auto">
                            <ThemeToggle />
                        </div>
                    ) : (
                        <>
                            {/* Navigation Links */}
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
                                {navItems.map(({ href, label }) => {
                                    const isActive =
                                        href === "/"
                                            ? pathname === "/" ||
                                              pathname.startsWith("/analyses")
                                            : pathname.startsWith(href);

                                    return (
                                        <Link
                                            key={href}
                                            href={href}
                                            className={`text-sm font-medium transition-colors duration-150 ${
                                                isActive
                                                    ? "text-zinc-900 dark:text-zinc-100"
                                                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                                            }`}
                                        >
                                            {label}
                                        </Link>
                                    );
                                })}
                            </div>

                            <div className="ml-auto">
                                <UserMenu />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
