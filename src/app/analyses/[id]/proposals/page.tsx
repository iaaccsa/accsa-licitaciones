"use client";

import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function ProposalsPage() {
    const params = useParams();
    const id = params.id as string;

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center gap-3">
                <a
                    href={`/analyses/${id}`}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al análisis
                </a>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
                <h1 className="text-2xl font-bold text-zinc-900">Propuestas</h1>
            </div>
        </div>
    );
}
