"use client";

import Link from "next/link";
import { ClipboardCheck, Settings } from "lucide-react";
import { AnalysisList } from "@/components/AnalysisList";

export default function AdminPage() {
    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 font-serif italic">
                    Análisis
                </h1>
                <div className="flex items-center gap-2">
                    <Link
                        href="/admin/review"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm"
                    >
                        <ClipboardCheck className="w-4 h-4" />
                        Revisión
                    </Link>
                    <Link
                        href="/admin/config"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm"
                    >
                        <Settings className="w-4 h-4" />
                        Configuración
                    </Link>
                </div>
            </div>
            <AnalysisList basePath="/admin/analyses" scope="all" />
        </div>
    );
}
