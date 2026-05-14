import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { id, proposalId } = await params;

    if (!validateUUID(id) || !validateUUID(proposalId)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_PROPOSAL_ECONOMIC_OFFERS_PATH}by-proposal/${proposalId}`;

        const res = await fetch(url, {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
            cache: "no-store",
        });

        if (res.status === 404) {
            return NextResponse.json(null);
        }
        if (!res.ok) {
            safeLogError("economic-offer", res.status, res.statusText);
            return apiError("Failed to fetch economic offer", res.status);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in economic-offer API route:", error);
        return apiError("Internal server error", 500);
    }
}
