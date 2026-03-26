import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError, parsePaginationBody } from "@/lib/api-utils";

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
        const rawBody = await request.json().catch(() => null);
        const { limit, offset } = parsePaginationBody(rawBody);

        const url = `${env.API_BASE_URL}${env.API_REQUIREMENTS_PATH}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify({
                analysis_id: id,
                limit: limit || 10,
                offset: offset || 0
            }),
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
