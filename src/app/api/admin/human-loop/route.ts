import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

function backendUrl() {
    const env = getEnv();
    const settingsPath = env.API_SETTINGS_PATH ?? "/api/v1/settings";
    return {
        url: `${env.API_BASE_URL}${settingsPath}/hitl`,
        apiKey: env.BACKEND_API_KEY,
    };
}

export async function GET() {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
        const { url, apiKey } = backendUrl();
        const response = await fetch(url, {
            headers: { "X-API-Key": apiKey },
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/human-loop/GET", response.status, await response.text());
        return apiError("Failed to get HITL config", response.status);
    } catch (error) {
        console.error("Error getting HITL config:", error);
        return apiError("Internal server error", 500);
    }
}

export async function PUT(request: NextRequest) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { url, apiKey } = backendUrl();
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
                ...(await getAuditHeaders(request)),
            },
            body: JSON.stringify({ hitl: body.hitl }),
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/human-loop/PUT", response.status, await response.text());
        return apiError("Failed to update HITL config", response.status);
    } catch (error) {
        console.error("Error updating HITL config:", error);
        return apiError("Internal server error", 500);
    }
}
