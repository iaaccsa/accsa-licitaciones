import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

const ADMISSIBILITY_REQUIREMENTS_PATH = "/api/v1/admissibility-requirements";

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
        const url = `${env.API_BASE_URL}${ADMISSIBILITY_REQUIREMENTS_PATH}/${id}/verify-all?is_verified=${isVerified}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        } else {
            safeLogError("analyses/[id]/admissibility-requirements/verify-all", response.status, await response.text());
            return apiError("Failed to update admissibility requirements", response.status);
        }
    } catch (error) {
        console.error("Error updating admissibility requirements:", error);
        return apiError("Internal server error", 500);
    }
}
