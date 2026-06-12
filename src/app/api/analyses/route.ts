import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get("job_id");

        if (!jobId) {
            return apiError("job_id is required", 400);
        }

        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify({ job_id: jobId }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("analyses/GET", response.status, await response.text());
            return apiError("Failed to get job status", response.status);
        }
    } catch (error) {
        console.error("Error getting job status:", error);
        return apiError("Internal server error", 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data } = await supabase.auth.getClaims();
        const claims = data?.claims;
        if (!claims) return apiError("unauthorized", 401);

        const body = await request.json();
        body.created_by = claims.sub;
        body.user_email = claims.email ?? null;
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}`;

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
            safeLogError("analyses/POST", response.status, await response.text());
            return apiError("Failed to create analysis", response.status);
        }
    } catch (error) {
        console.error("Error creating analysis:", error);
        return apiError("Internal server error", 500);
    }
}
