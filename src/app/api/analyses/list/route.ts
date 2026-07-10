import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";
import { isAuthDisabled } from "@/lib/dev-auth";

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const claims = claimsData?.claims;
        if (!claims && !isAuthDisabled()) return apiError("unauthorized", 401);
        const role = (claims?.app_metadata as { role?: string } | undefined)?.role;
        const scope = new URL(request.url).searchParams.get("scope");

        const env = getEnv();
        let url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}`;
        if (claims && !isAuthDisabled() && !(scope === "all" && role === "administrator")) {
            url += `?created_by=${claims.sub}`;
        }

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            const list = Array.isArray(data) ? data : [data];
            return NextResponse.json(list);
        } else {
            safeLogError("analyses/list", response.status, await response.text());
            return apiError("Failed to fetch analyses", response.status);
        }
    } catch (error) {
        console.error("Error fetching analyses:", error);
        return apiError("Internal server error", 500);
    }
}
