import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";

export async function GET() {
    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}`;

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
