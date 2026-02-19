import { NextResponse } from "next/server";

export async function GET() {
    try {
        const baseUrl = process.env.API_BASE_URL;
        const analysesPath = process.env.API_ANALYSES_PATH;

        if (!baseUrl || !analysesPath) {
            console.error("API_BASE_URL or API_ANALYSES_PATH not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${analysesPath}`;

        // Fetch analyses list
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            // cache: "no-store" // Ensure fresh data
        });

        if (response.ok) {
            const data = await response.json();
            // Handle single object response by wrapping in array
            const list = Array.isArray(data) ? data : [data];
            return NextResponse.json(list);
        } else {
            console.error("Webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch analyses" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching analyses:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
