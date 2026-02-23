import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const baseUrl = process.env.API_BASE_URL;
    const chatPath = process.env.API_CHAT_PATH;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl || !chatPath || !apiKey) {
        return NextResponse.json(
            { error: "API_BASE_URL, API_CHAT_PATH or BACKEND_API_KEY not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();

        const response = await fetch(`${baseUrl}${chatPath}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error calling chat endpoint:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
