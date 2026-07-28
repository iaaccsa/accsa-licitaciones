"use client";

import { useParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import ComplianceMatrix from "@/components/ComplianceMatrix";

export default function ProposalRequirementsPage() {
    const params = useParams();
    const analysisId = params.id as string;
    const proposalId = params.proposalId as string;

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 md:p-8 space-y-6">
                <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-green-600 dark:text-green-400" />
                        Matriz de Cumplimiento
                    </h1>
                </div>

                <div className="min-w-0">
                    <ComplianceMatrix analysisId={analysisId} proposalId={proposalId} />
                </div>
            </div>
        </div>
    );
}
