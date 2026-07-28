import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}/cost`;

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (!res.ok) {
            safeLogError("analyses/[id]/cost", res.status, res.statusText);
            return apiError("Failed to fetch cost summary", res.status);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in cost API route:", error);
        return apiError("Internal server error", 500);
    }
}
