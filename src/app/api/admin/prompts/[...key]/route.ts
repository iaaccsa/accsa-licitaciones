import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { getAuditHeaders } from "@/lib/supabase/audit-headers";

const SEGMENT_REGEX = /^[a-z0-9_-]+$/i;

function resolveKey(segments: string[]): string | null {
    if (segments.length === 0) return null;
    if (!segments.every((s) => SEGMENT_REGEX.test(s))) return null;
    return segments.join("/");
}

function backendBase() {
    const env = getEnv();
    const promptsPath = env.API_PROMPTS_PATH ?? "/api/v1/prompts";
    return { base: `${env.API_BASE_URL}${promptsPath}`, apiKey: env.BACKEND_API_KEY };
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ key: string[] }> }
) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const key = resolveKey((await params).key);
    if (!key) return apiError("Invalid prompt key", 400);

    try {
        const { base, apiKey } = backendBase();
        const response = await fetch(`${base}/${key}`, {
            headers: { "X-API-Key": apiKey },
        });
        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/prompts/[key]/GET", response.status, await response.text());
        return apiError("Failed to get prompt", response.status);
    } catch (error) {
        console.error("Error getting prompt:", error);
        return apiError("Internal server error", 500);
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ key: string[] }> }
) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const key = resolveKey((await params).key);
    if (!key) return apiError("Invalid prompt key", 400);

    try {
        const body = await request.json();
        const { base, apiKey } = backendBase();
        const response = await fetch(`${base}/${key}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
                ...(await getAuditHeaders(request)),
            },
            body: JSON.stringify({ body: body.body }),
        });

        const data = await response.json().catch(() => null);
        // Forward backend status (incl. 422 placeholder errors) and payload.
        return NextResponse.json(data ?? { error: "upstream error" }, {
            status: response.status,
        });
    } catch (error) {
        console.error("Error updating prompt:", error);
        return apiError("Internal server error", 500);
    }
}
