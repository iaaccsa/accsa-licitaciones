import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { id, proposalId } = await params;

    if (!validateUUID(id) || !validateUUID(proposalId)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    try {
        const env = getEnv();
        const body = await request.json();
        const { offset = 0, limit = 20 } = body;

        const payload = {
            proposal_id: proposalId,
            offset,
            limit,
        };

        const url = `${env.API_BASE_URL}${env.API_COMPLIANCE_RESULTS_PATH}`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            safeLogError("compliance", res.status, res.statusText);
            return apiError("Failed to fetch compliance results", res.status);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in compliance API route:", error);
        return apiError("Internal server error", 500);
    }
}
