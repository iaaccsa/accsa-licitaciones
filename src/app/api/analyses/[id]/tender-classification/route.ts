import { NextResponse } from "next/server";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    const baseUrl = process.env.API_BASE_URL;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl) {
        return apiError("API_BASE_URL not configured", 500);
    }

    const path = process.env.API_TENDER_CLASSIFICATIONS_PATH || "/api/v1/tender-classifications/";

    try {
        const response = await fetch(`${baseUrl}${path}${id}`, {
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
            safeLogError("analyses/[id]/tender-classification", response.status, await response.text());
            return apiError("Failed to fetch tender classification", response.status);
        }
    } catch (error) {
        console.error("Error fetching tender classification:", error);
        return apiError("Internal server error", 500);
    }
}
