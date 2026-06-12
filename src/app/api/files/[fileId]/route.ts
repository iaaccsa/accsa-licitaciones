import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireEntityAnalysisAccess } from "@/lib/supabase/require-analysis-access";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const { fileId } = await params;

    if (!validateUUID(fileId)) {
        return invalidIdResponse();
    }

    if (!(await requireEntityAnalysisAccess("original_files", fileId))) {
        return apiError("Analysis not found", 404);
    }

    try {
        const env = getEnv();
        const body = await request.json();
        const url = `${env.API_BASE_URL}/api/v1/original-files/${fileId}`;

        const response = await fetch(url, {
            method: "PATCH",
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
            safeLogError("files/[fileId]", response.status, await response.text());
            return apiError("Failed to update file", response.status);
        }
    } catch (error) {
        console.error("Error updating file:", error);
        return apiError("Internal server error", 500);
    }
}
