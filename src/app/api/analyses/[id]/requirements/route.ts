import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const webhookUrl = process.env.API_GET_REQUIREMENTS_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("API_GET_REQUIREMENTS_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        const { limit, offset } = await request.json().catch(() => ({}));

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                uuid: id,
                limit: limit || 10,
                offset: offset || 0
            }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            console.error("Requirements webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch requirements" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching requirements:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
