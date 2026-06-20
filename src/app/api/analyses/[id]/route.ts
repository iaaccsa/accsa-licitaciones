import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

export async function GET(
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

export async function PATCH(
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

    try {
        const env = getEnv();
        const incoming = await request.json();
        const raw = incoming?.user_assigned_name;
        const trimmed = typeof raw === "string" ? raw.trim() : "";
        // Empty clears the manual name (NULL) and the UI falls back to the AI name.
        const body = { user_assigned_name: trimmed.length > 0 ? trimmed.slice(0, 200) : null };
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}/${id}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
                ...(await getAuditHeaders(request)),
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else if (response.status === 404) {
            return apiError("Analysis not found", 404);
        } else {
            safeLogError("analyses/[id] PATCH", response.status, await response.text());
            return apiError("Failed to update analysis", response.status);
        }
    } catch (error) {
        console.error("Error updating analysis:", error);
        return apiError("Internal server error", 500);
    }
}
