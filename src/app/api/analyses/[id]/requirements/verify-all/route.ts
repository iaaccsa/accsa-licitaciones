import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    const isVerified = request.nextUrl.searchParams.get("is_verified");

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_REQUIREMENTS_PATH}/${id}/verify-all?is_verified=${isVerified}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/[id]/requirements/verify-all", response.status, await response.text());
            return apiError("Failed to update requirements", response.status);
        }
    } catch (error) {
        console.error("Error updating requirements:", error);
        return apiError("Internal server error", 500);
    }
}
