import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;

    const baseUrl = process.env.API_BASE_URL;
    const proposalsPath = process.env.API_PROPOSALS_PATH;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl || !proposalsPath || !apiKey) {
        return NextResponse.json(
            { error: "API_BASE_URL, API_PROPOSALS_PATH, or BACKEND_API_KEY not configured" },
            { status: 500 }
        );
    }

    try {
        const url = `${baseUrl}${proposalsPath}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify({ analysis_id: id }),
        });

        if (!res.ok) {
            console.error(
                `Error fetching proposals: ${res.status} ${res.statusText}`
            );
            return NextResponse.json(
                { error: "Failed to fetch proposals from external API" },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in proposals API route:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
