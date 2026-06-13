import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    const isVerified = request.nextUrl.searchParams.get("is_verified");

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_REQUIREMENTS_PATH}/${id}/verify-all?is_verified=${isVerified}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
                ...(await getAuditHeaders(request)),
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
