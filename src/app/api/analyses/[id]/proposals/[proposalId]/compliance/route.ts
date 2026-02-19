import { NextRequest, NextResponse } from "next/server";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { proposalId } = await params;

    const baseUrl = process.env.API_BASE_URL;
    const compliancePath = process.env.API_GET_COMPLIANCE_RESULTS_PATH;
    const apiKey = process.env.BACKEND_API_KEY;

    if (!baseUrl || !compliancePath || !apiKey) {
        return NextResponse.json(
            { error: "API_BASE_URL, API_GET_COMPLIANCE_RESULTS_PATH, or BACKEND_API_KEY not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { offset = 0, limit = 20 } = body;

        const payload = {
            proposal_id: proposalId,
            offset,
            limit,
        };

        const url = `${baseUrl}${compliancePath}`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.error(
                `Error fetching compliance results: ${res.status} ${res.statusText}`
            );
            return NextResponse.json(
                { error: "Failed to fetch compliance results" },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in compliance API route:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
