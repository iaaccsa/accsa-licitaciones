"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import WorkflowVisualization from "@/components/WorkflowVisualization";

export default function AnalysisFlowPage() {
    const params = useParams();
    const id = params.id as string;
    const [status, setStatus] = useState<string>("processing");

    useEffect(() => {
        if (!id) return;
        fetch(`/api/analyses/${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.status) setStatus(data.status); })
            .catch(() => {});
    }, [id]);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <WorkflowVisualization analysisId={id} analysisStatus={status} />
        </div>
    );
}
