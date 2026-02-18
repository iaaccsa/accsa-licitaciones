import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const id = (await params).id;

    if (!process.env.API_GET_PROPOSALS_WEBHOOK_URL) {
        return NextResponse.json(
            { error: "API_GET_PROPOSALS_WEBHOOK_URL not configured" },
            { status: 500 }
        );
    }

    try {
        const res = await fetch(process.env.API_GET_PROPOSALS_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ uuid: id }),
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
