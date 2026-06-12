import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { id, proposalId } = await params;

    if (!validateUUID(id) || !validateUUID(proposalId)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("Invalid JSON body", 400);
    }

    const status = (body as { admissibility_status?: unknown })?.admissibility_status;
    if (status !== "admitida" && status !== "rechazada") {
        return apiError("admissibility_status must be 'admitida' or 'rechazada'", 422);
    }

    try {
        const env = getEnv();
        const proposalsBase = env.API_PROPOSALS_PATH.replace(/\/search$/, "");
        const url = `${env.API_BASE_URL}${proposalsBase}/${proposalId}/admissibility-override`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify({
                admissibility_status: status,
                overridden_by: "ui",
            }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        }
        safeLogError("admissibility-override", response.status, await response.text());
        return apiError("Failed to override admissibility", response.status);
    } catch (error) {
        console.error("Error overriding admissibility:", error);
        return apiError("Internal server error", 500);
    }
}
