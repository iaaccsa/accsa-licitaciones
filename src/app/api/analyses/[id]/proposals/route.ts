import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_PROPOSALS_PATH}`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify({ analysis_id: id }),
        });

        if (!res.ok) {
            safeLogError("analyses/[id]/proposals", res.status, res.statusText);
            return apiError("Failed to fetch proposals", res.status);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in proposals API route:", error);
        return apiError("Internal server error", 500);
    }
}
