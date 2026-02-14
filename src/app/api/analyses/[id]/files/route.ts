import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const webhookUrl = process.env.GET_FILES_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("GET_FILES_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        const response = await fetch(webhookUrl, {
            method: "POST", // Based on user instruction "payload ... is {uuid}"
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ uuid: id }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            console.error("Files webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch files" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching files:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
