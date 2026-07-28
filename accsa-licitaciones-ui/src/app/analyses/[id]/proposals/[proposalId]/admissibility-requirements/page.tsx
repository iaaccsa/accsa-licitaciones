"use client";

import { useParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import AdmissibilityMatrix from "@/components/AdmissibilityMatrix";

export default function ProposalAdmissibilityPage() {
    const params = useParams();
    const analysisId = params.id as string;
    const proposalId = params.proposalId as string;

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 md:p-8 space-y-6">
                <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                        Admisibilidad
                    </h1>
                </div>

                <div className="min-w-0">
                    <AdmissibilityMatrix analysisId={analysisId} proposalId={proposalId} />
                </div>
            </div>
        </div>
    );
}
