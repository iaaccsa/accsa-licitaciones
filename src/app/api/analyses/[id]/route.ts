import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else if (response.status === 404) {
            return apiError("Analysis not found", 404);
        } else {
            safeLogError("analyses/[id]", response.status, await response.text());
            return apiError("Failed to fetch analysis", response.status);
        }
    } catch (error) {
        console.error("Error fetching analysis details:", error);
        return apiError("Internal server error", 500);
    }
}
