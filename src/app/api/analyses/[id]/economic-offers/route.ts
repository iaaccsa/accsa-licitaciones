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
        if (!env.API_PROPOSAL_ECONOMIC_OFFERS_PATH) {
            return apiError("API_PROPOSAL_ECONOMIC_OFFERS_PATH not configured", 503);
        }
        const url = `${env.API_BASE_URL}${env.API_PROPOSAL_ECONOMIC_OFFERS_PATH}by-analysis/${id}`;

        const res = await fetch(url, {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
            cache: "no-store",
        });

        if (!res.ok) {
            safeLogError("economic-offers-by-analysis", res.status, res.statusText);
            return apiError("Failed to fetch economic offers", res.status);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in economic-offers list API route:", error);
        return apiError("Internal server error", 500);
    }
}
