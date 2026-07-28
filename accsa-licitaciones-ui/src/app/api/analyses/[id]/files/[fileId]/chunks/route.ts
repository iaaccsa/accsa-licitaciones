import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; fileId: string }> }
) {
    const { id, fileId } = await params;

    if (!validateUUID(id) || !validateUUID(fileId)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    try {
        const env = getEnv();
        const body = await request.json();

        const url = `${env.API_BASE_URL}${env.API_QDRANT_POINTS}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("chunks", response.status, await response.text());
            return apiError("Failed to fetch chunks", response.status);
        }
    } catch (error) {
        console.error("Error fetching chunks:", error);
        return apiError("Internal server error", 500);
    }
}
