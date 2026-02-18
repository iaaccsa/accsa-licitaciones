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
        const webhookUrl = process.env.API_GET_ANALYSES_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("API_GET_ANALYSES_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        // Fetch list and filter
        const response = await fetch(webhookUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
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
