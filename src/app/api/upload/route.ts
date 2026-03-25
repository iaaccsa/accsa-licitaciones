import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as Blob | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        const baseUrl = process.env.API_BASE_URL;
        const analysesPath = process.env.API_ANALYSES_PATH;

        if (!baseUrl || !analysesPath) {
            console.error("API_BASE_URL or API_ANALYSES_PATH not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${analysesPath}${analysesPath.endsWith("/") ? "" : "/"}`;
        const apiKey = process.env.BACKEND_API_KEY;

        if (!apiKey) {
            console.error("BACKEND_API_KEY not configured");
            return NextResponse.json(
                { error: "API Key Configuration Error" },
                { status: 500 }
            );
        }

        // Forward the file to the backend
        const backendFormData = new FormData();
        backendFormData.append("file", file, "licitacion_documentos.zip");

        const userName = formData.get("user_name");
        if (userName) {
            backendFormData.append("user_name", userName);
        }

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-API-Key": apiKey,
            },
            body: backendFormData,
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            const errorText = await response.text();
            console.error("Backend error:", response.status, errorText);
            return NextResponse.json(
                { error: "Failed to create analysis" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error processing upload:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
