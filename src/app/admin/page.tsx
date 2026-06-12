"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { AnalysisList } from "@/components/AnalysisList";
import CleanupButton from "@/components/CleanupButton";

export default function AdminPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                    Análisis
                </h1>
                <div className="flex items-center gap-2">
                    <Link
                        href="/admin/status"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
                    >
                        <Activity className="w-4 h-4" />
                        Estado del Sistema
                    </Link>
                    <CleanupButton />
                </div>
            </div>
            <AnalysisList basePath="/admin/analyses" scope="all" />
        </div>
    );
}
