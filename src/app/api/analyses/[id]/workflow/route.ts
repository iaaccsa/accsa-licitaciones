import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const baseUrl = process.env.API_BASE_URL;
        const workflowStepsPath = process.env.API_GET_WORKFLOW_STEPS_PATH;

        if (!baseUrl || !workflowStepsPath) {
            console.error("API_BASE_URL or API_GET_WORKFLOW_STEPS_PATH not configured");
            return NextResponse.json(
                { error: "API not configured" },
                { status: 500 }
            );
        }

        const { limit, offset } = await request.json().catch(() => ({}));

        const url = `${baseUrl}${workflowStepsPath}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
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
            console.error("Workflow webhook error:", response.status, await response.text());
            return NextResponse.json(
                { error: "Failed to fetch workflow steps" },
                { status: response.status }
            );
        }
    } catch (error) {
        console.error("Error fetching workflow steps:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
