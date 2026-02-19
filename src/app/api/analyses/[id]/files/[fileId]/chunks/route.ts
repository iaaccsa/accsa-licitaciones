import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string; fileId: string }> }
) {
    // We don't actually need id/fileId for the webhook itself based on the payload description,
    // but they are part of the route. The payload comes from the request body.
    await params;

    const baseUrl = process.env.API_BASE_URL;
    const qdrantPointsPath = process.env.API_GET_QDRANT_POINTS;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl || !qdrantPointsPath || !apiKey) {
        return NextResponse.json(
            { error: "API_BASE_URL, API_GET_QDRANT_POINTS, or BACKEND_API_KEY not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();

        // console.log("Chunks webhook body:", body);

        // The webhook expects:
        // {
        //     "slug": "139e33cd",
        //     "category": "proposal",
        //     "label": "proposal1",
        //     "offset": "" 
        // }
        // We will receive this from the client.

        const url = `${baseUrl}${qdrantPointsPath}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            // console.log("Chunks webhook response:", data);
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
