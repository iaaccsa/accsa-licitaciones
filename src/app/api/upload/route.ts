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

        const webhookUrl = process.env.CREATE_JOB_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error("CREATE_JOB_WEBHOOK_URL not configured");
            return NextResponse.json(
                { error: "Webhook not configured" },
                { status: 500 }
            );
        }

        // Forward the file to the webhook
        const webhookFormData = new FormData();
        webhookFormData.append("file", file, "licitacion_documentos.zip");

        const response = await fetch(webhookUrl, {
            method: "POST",
            body: webhookFormData,
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json({ success: true, job_id: data.job_id });
        } else {
            const errorText = await response.text();
            console.error("Webhook error:", response.status, errorText);
            return NextResponse.json(
                { error: "Webhook request failed", details: errorText },
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
