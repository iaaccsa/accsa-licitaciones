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

        const webhookUrl = process.env.API_CREATE_ANALYSIS_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("API_CREATE_ANALYSIS_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        // Call webhook with POST and job_id in body
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
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
