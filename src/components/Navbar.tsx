"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Upload, ListChecks, ShieldCheck } from "lucide-react";

const navItems = [
    { href: "/", label: "Iniciar", icon: Upload },
    { href: "/analyses", label: "Análisis", icon: ListChecks },
    { href: "/admin", label: "Admin", icon: ShieldCheck },
] as const;

export function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center h-14 gap-8">
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
                        <span className="text-lg font-semibold text-zinc-800 font-serif italic">
                            Asistente de Compras Estatales
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <div className="flex items-center gap-1">
                        {navItems.map(({ href, label, icon: Icon }) => {
                            const isActive =
                                href === "/" ? pathname === "/" : pathname.startsWith(href);

                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-colors duration-150
                    ${isActive
                                            ? "bg-blue-50 text-blue-700"
                                            : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
                                        }
                  `}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </nav>
    );
}
