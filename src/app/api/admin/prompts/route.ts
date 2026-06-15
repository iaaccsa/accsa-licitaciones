import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function GET() {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
        const env = getEnv();
        const promptsPath = env.API_PROMPTS_PATH ?? "/api/v1/prompts";
        const response = await fetch(`${env.API_BASE_URL}${promptsPath}`, {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
        });

        if (response.ok) {
            return NextResponse.json(await response.json());
        }
        safeLogError("admin/prompts/GET", response.status, await response.text());
        return apiError("Failed to list prompts", response.status);
    } catch (error) {
        console.error("Error listing prompts:", error);
        return apiError("Internal server error", 500);
    }
}
