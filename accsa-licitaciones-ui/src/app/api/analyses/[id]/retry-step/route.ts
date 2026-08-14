import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    if (!(await requireAnalysisAccess(id))) {
        return apiError("Analysis not found", 404);
    }

    const body = await request.json().catch(() => null);
    const serviceName = body?.service_name;
    if (typeof serviceName !== "string" || !serviceName) {
        return apiError("service_name is required", 400);
    }

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}/retry-step`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
                ...(await getAuditHeaders(request)),
            },
            body: JSON.stringify({ service_name: serviceName }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/[id]/retry-step", response.status, await response.text());
            return apiError("Failed to retry step", response.status);
        }
    } catch (error) {
        console.error("Error retrying step:", error);
        return apiError("Internal server error", 500);
    }
}
