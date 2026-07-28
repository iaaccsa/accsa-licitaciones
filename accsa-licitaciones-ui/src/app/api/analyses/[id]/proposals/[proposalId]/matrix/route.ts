import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

const MATRIX_PATH = "/api/v1/analysis-compliance-matrix/view";

export async function GET(
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
        const search = request.nextUrl.searchParams;
        const upstream = new URL(`${env.API_BASE_URL}${MATRIX_PATH}/by-proposal/${proposalId}`);

        // Forward supported query params
        for (const role of search.getAll("role")) {
            upstream.searchParams.append("role", role);
        }
        for (const vm of search.getAll("verification_method")) {
            upstream.searchParams.append("verification_method", vm);
        }

        const order = search.get("order") ?? "asc";
        upstream.searchParams.set("order", order);

        const limit = search.get("limit") ?? "50";
        const offset = search.get("offset") ?? "0";
        upstream.searchParams.set("limit", limit);
        upstream.searchParams.set("offset", offset);

        const res = await fetch(upstream.toString(), {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
        });

        if (!res.ok) {
            safeLogError("matrix/by-proposal", res.status, res.statusText);
            return apiError("Failed to fetch compliance matrix", res.status);
        }

        return NextResponse.json(await res.json());
    } catch (error) {
        console.error("Error in matrix route:", error);
        return apiError("Internal server error", 500);
    }
}
