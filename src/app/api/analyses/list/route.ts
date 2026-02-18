import { NextResponse } from "next/server";

export async function GET() {
    try {
        const webhookUrl = process.env.API_GET_ANALYSES_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("API_GET_ANALYSES_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        // Fetch analyses list from webhook (assuming GET)
        const response = await fetch(webhookUrl, {
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
