import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";

export async function POST() {
    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${env.API_UPLOAD_TOKEN_PATH}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("upload-token", response.status, await response.text());
            return apiError("Failed to generate upload token", response.status);
        }
    } catch (error) {
        console.error("Error generating upload token:", error);
        return apiError("Internal server error", 500);
    }
}
