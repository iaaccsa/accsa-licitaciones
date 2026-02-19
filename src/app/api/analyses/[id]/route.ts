import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    interface Analysis {
        id: string;
        [key: string]: unknown;
    }

    try {
        const baseUrl = process.env.API_BASE_URL;
        const analysesPath = process.env.API_ANALYSES_PATH;
        const apiKey = process.env.BACKEND_API_KEY;

        if (!baseUrl || !analysesPath || !apiKey) {
            console.error("API_BASE_URL, API_ANALYSES_PATH, or BACKEND_API_KEY not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${analysesPath}`;

        // Fetch list and filter
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
        });

        if (response.ok) {
            const data = await response.json();
            // Handle single object or array
            const list: Analysis[] = Array.isArray(data) ? data : [data];

            const analysis = list.find((item) => item.id === id);

            if (analysis) {
                return NextResponse.json(analysis);
            } else {
                return NextResponse.json(
                    { error: "Analysis not found" },
                    { status: 404 }
                );
            }
        } else {
            console.error("Analyses webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch analyses" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching analysis details:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
