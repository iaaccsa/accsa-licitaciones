import { NextResponse } from "next/server";
import { apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ label: string }> }
) {
    const { label } = await params;

    const baseUrl = process.env.API_BASE_URL;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl) {
        return apiError("API_BASE_URL not configured", 500);
    }

    const basePath = process.env.API_TENDER_EVALUATION_TYPES_PATH || "/api/v1/tender-evaluation-types/";

    try {
        const response = await fetch(`${baseUrl}${basePath}by-label/${encodeURIComponent(label)}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey || "",
            },
            cache: "no-store",
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("tender-evaluation-types/by-label", response.status, await response.text());
            return apiError("Failed to fetch tender evaluation type", response.status);
        }
    } catch (error) {
        console.error("Error fetching tender evaluation type by label:", error);
        return apiError("Internal server error", 500);
    }
}
