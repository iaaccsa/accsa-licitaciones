import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function POST(request: NextRequest) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
        const env = getEnv();
        const auditPath = env.API_AUDIT_LOGS_PATH ?? "/api/v1/audit-logs";
        const url = `${env.API_BASE_URL}${auditPath}/search`;
        const body = await request.json();

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/audit-logs/POST", response.status, await response.text());
        return apiError("Failed to fetch audit logs", response.status);
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        return apiError("Internal server error", 500);
    }
}
