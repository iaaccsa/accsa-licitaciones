import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

function backendUrl() {
    const env = getEnv();
    const settingsPath = env.API_SETTINGS_PATH ?? "/api/v1/settings";
    return {
        url: `${env.API_BASE_URL}${settingsPath}/infra-config`,
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
        safeLogError("admin/infra-config/GET", response.status, await response.text());
        return apiError("Failed to get infra config", response.status);
    } catch (error) {
        console.error("Error getting infra config:", error);
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
        // Write-only: forward only non-empty fields; empty = leave unchanged.
        const fields = [
            "qdrant_url",
            "qdrant_api_key",
            "openai_api_key",
            "google_api_key",
            "mistral_api_key",
        ] as const;
        const payload: Record<string, string> = {};
        for (const field of fields) {
            const value = body[field];
            if (typeof value === "string" && value.length > 0) {
                payload[field] = value;
            }
        }

        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
                ...(await getAuditHeaders(request)),
            },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/infra-config/PUT", response.status, await response.text());
        return apiError("Failed to update infra config", response.status);
    } catch (error) {
        console.error("Error updating infra config:", error);
        return apiError("Internal server error", 500);
    }
}
