import { NextRequest, NextResponse } from "next/server";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
    const { proposalId } = await params;

    const baseUrl = process.env.API_BASE_URL;
    const compliancePath = process.env.API_GET_COMPLIANCE_RESULTS_PATH;

    if (!baseUrl || !compliancePath) {
        return NextResponse.json(
            { error: "API_BASE_URL or API_GET_COMPLIANCE_RESULTS_PATH not configured" },
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
