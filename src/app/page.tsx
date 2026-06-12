"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { AnalysisList } from "@/components/AnalysisList";

export default function StatusPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                    Análisis
                </h1>
                <Link
                    href="/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-150"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo análisis
                </Link>
            </div>
            <AnalysisList />
        </div>
    );
}
