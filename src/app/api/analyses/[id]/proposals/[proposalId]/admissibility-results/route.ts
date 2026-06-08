import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

const ADMISSIBILITY_RESULTS_PATH = "/api/v1/admissibility-results";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { proposalId } = await params;

    if (!validateUUID(proposalId)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const search = request.nextUrl.searchParams;
        const upstream = new URL(`${env.API_BASE_URL}${ADMISSIBILITY_RESULTS_PATH}/by-proposal/${proposalId}`);

        for (const verdict of search.getAll("verdict")) {
            upstream.searchParams.append("verdict", verdict);
        }

        const role = search.get("role");
        if (role) upstream.searchParams.set("role", role);

        const domain = search.get("domain");
        if (domain) upstream.searchParams.set("domain", domain);

        const isVerified = search.get("is_verified");
        if (isVerified === "true" || isVerified === "false") {
            upstream.searchParams.set("is_verified", isVerified);
        }

        const manual = search.get("manual_verification_required");
        if (manual === "true" || manual === "false") {
            upstream.searchParams.set("manual_verification_required", manual);
        }

        upstream.searchParams.set("limit", search.get("limit") ?? "50");
        upstream.searchParams.set("offset", search.get("offset") ?? "0");

        const res = await fetch(upstream.toString(), {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
        });

        if (!res.ok) {
            safeLogError("admissibility-results/by-proposal", res.status, res.statusText);
            return apiError("Failed to fetch admissibility results", res.status);
        }

        return NextResponse.json(await res.json());
    } catch (error) {
        console.error("Error in admissibility-results route:", error);
        return apiError("Internal server error", 500);
    }
}
