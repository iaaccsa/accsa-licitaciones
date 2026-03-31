import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";

export async function POST() {
    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}/api/v1/cleanup/`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("cleanup", response.status, await response.text());
            return apiError("Failed to run cleanup", response.status);
        }
    } catch (error) {
        console.error("Error running cleanup:", error);
        return apiError("Internal server error", 500);
    }
}
