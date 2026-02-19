import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const baseUrl = process.env.API_BASE_URL;
        const requirementsPath = process.env.API_GET_REQUIREMENTS_PATH;
        const apiKey = process.env.BACKEND_API_KEY;

        if (!baseUrl || !requirementsPath || !apiKey) {
            console.error("API_BASE_URL, API_GET_REQUIREMENTS_PATH, or BACKEND_API_KEY not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const { limit, offset } = await request.json().catch(() => ({}));

        const url = `${baseUrl}${requirementsPath}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify({
                analysis_id: id,
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
