import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

const ADMISSIBILITY_REQUIREMENTS_PATH = "/api/v1/admissibility-requirements";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ requirementId: string }> }
) {
    const { requirementId } = await params;

    if (!validateUUID(requirementId)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const body = await request.json();
        const url = `${env.API_BASE_URL}${ADMISSIBILITY_REQUIREMENTS_PATH}/${requirementId}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admissibility-requirements/[requirementId]", response.status, await response.text());
        return apiError("Failed to update admissibility requirement", response.status);
    } catch (error) {
        console.error("Error updating admissibility requirement:", error);
        return apiError("Internal server error", 500);
    }
}
