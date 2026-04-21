import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_WORKFLOW_PHASES_PATH}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify({ analysis_id: id }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/[id]/phases", response.status, await response.text());
            return apiError("Failed to fetch workflow phases", response.status);
        }
    } catch (error) {
        console.error("Error fetching workflow phases:", error);
        return apiError("Internal server error", 500);
    }
}
