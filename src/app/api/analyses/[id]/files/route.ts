import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const baseUrl = process.env.API_BASE_URL;
        const filesPath = process.env.API_GET_FILES_PATH;

        if (!baseUrl || !filesPath) {
            console.error("API_BASE_URL or API_GET_FILES_PATH not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${filesPath}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ analysis_id: id }),
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
