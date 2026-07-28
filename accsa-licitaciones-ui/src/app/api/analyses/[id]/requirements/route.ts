import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function GET(
    request: NextRequest,
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
        const searchParams = request.nextUrl.searchParams;
        const limit = searchParams.get("limit") ?? "50";
        const offset = searchParams.get("offset") ?? "0";

        const qs = new URLSearchParams({ limit, offset });

        const url = `${env.API_BASE_URL}${env.API_REQUIREMENTS_PATH}/${id}?${qs.toString()}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/[id]/requirements", response.status, await response.text());
            return apiError("Failed to fetch requirements", response.status);
        }
    } catch (error) {
        console.error("Error fetching requirements:", error);
        return apiError("Internal server error", 500);
    }
}
