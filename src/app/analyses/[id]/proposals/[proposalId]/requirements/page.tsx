"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import ComplianceMatrix from "@/components/ComplianceMatrix";

export default function ProposalRequirementsPage() {
    const params = useParams();
    const router = useRouter();
    const analysisId = params.id as string;
    const proposalId = params.proposalId as string;

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex flex-col gap-3">
                <Button
                    variant="ghost"
                    className="w-fit -ml-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver a la propuesta
                </Button>

                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-50 dark:bg-green-950 rounded-lg text-green-600 dark:text-green-400 shrink-0">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Matriz de Cumplimiento</h1>
                </div>
            </div>

            <div className="min-w-0">
                <ComplianceMatrix analysisId={analysisId} proposalId={proposalId} />
            </div>
        </div>
    );
}
