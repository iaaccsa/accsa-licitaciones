import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}/resume`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            const errorText = await response.text();
            console.error(`[analyses/[id]/resume] Backend error ${response.status}: ${errorText}`);
            safeLogError("analyses/[id]/resume", response.status, errorText);
            return apiError("Failed to resume analysis", response.status);
        }
    } catch (error) {
        console.error("Error resuming analysis:", error);
        return apiError("Internal server error", 500);
    }
}
