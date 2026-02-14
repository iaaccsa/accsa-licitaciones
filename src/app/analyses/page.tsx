"use client";

import { AnalysisList } from "@/components/AnalysisList";

export default function StatusPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-semibold text-zinc-800 mb-6 font-serif italic">
                Análisis
            </h1>
            <AnalysisList />
        </div>
    );
}
