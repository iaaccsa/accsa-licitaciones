import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}/failure`;

        const response = await fetch(url, {
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/[id]/failure", response.status, await response.text());
            return apiError("Failed to fetch analysis failure", response.status);
        }
    } catch (error) {
        console.error("Error fetching analysis failure:", error);
        return apiError("Internal server error", 500);
    }
}
