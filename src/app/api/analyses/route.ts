import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get("job_id");

        if (!jobId) {
            return NextResponse.json(
                { error: "job_id is required" },
                { status: 400 }
            );
        }

        const baseUrl = process.env.API_BASE_URL;
        const analysesPath = process.env.API_ANALYSES_PATH;
        const apiKey = process.env.BACKEND_API_KEY;

        if (!baseUrl || !analysesPath || !apiKey) {
            console.error("API_BASE_URL, API_ANALYSES_PATH, or BACKEND_API_KEY not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${analysesPath}`;

        // Call backend with POST and job_id in body
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify({ job_id: jobId }),
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            return NextResponse.json(
                { error: "Failed to get job status" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error getting job status:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const baseUrl = process.env.API_BASE_URL;
        const analysesPath = process.env.API_ANALYSES_PATH;
        const apiKey = process.env.BACKEND_API_KEY;

        if (!baseUrl || !analysesPath || !apiKey) {
            console.error("API_BASE_URL, API_ANALYSES_PATH, or BACKEND_API_KEY not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const url = `${baseUrl}${analysesPath}`;

        // Create analysis on backend
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
            return NextResponse.json(data);
        } else {
            const errorText = await response.text();
            console.error("Create analysis error:", response.status, errorText);
            return NextResponse.json(
                { error: "Failed to create analysis" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error creating analysis:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
