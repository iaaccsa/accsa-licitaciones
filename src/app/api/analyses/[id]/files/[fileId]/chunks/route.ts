import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; fileId: string }> }
) {
    // We don't actually need id/fileId for the webhook itself based on the payload description,
    // but they are part of the route. The payload comes from the request body.
    await params;

    try {
        const webhookUrl = process.env.GET_CHUNKS_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("GET_CHUNKS_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        const body = await request.json();

        // The webhook expects:
        // {
        //     "slug": "139e33cd",
        //     "category": "proposal",
        //     "label": "proposal1",
        //     "offset": "" 
        // }
        // We will receive this from the client.

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            console.error("Chunks webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch chunks" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching chunks:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
