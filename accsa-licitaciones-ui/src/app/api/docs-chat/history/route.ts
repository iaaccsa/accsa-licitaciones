import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";

const historySchema = z.object({
    conversation_id: z.string().uuid(),
});

export async function POST(request: Request) {
    try {
        const env = getEnv();
        if (!env.CHATBOT_DOCS_URL || !env.CHATBOT_DOCS_API_KEY) {
            return apiError("Documentation chatbot is not configured", 503);
        }

        const rawBody = await request.json();
        const parsed = historySchema.safeParse(rawBody);
        if (!parsed.success) {
            return apiError("Invalid request body", 400);
        }

        const baseUrl = env.CHATBOT_DOCS_URL.replace(/\/+$/, "");
        const response = await fetch(
            `${baseUrl}/conversations/${parsed.data.conversation_id}`,
            { headers: { "X-API-Key": env.CHATBOT_DOCS_API_KEY } },
        );

        const data = await response.json();

        if (!response.ok) {
            safeLogError("docs-chat-history", response.status, JSON.stringify(data));
            return apiError("Failed to fetch conversation", response.status);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching docs-chat history:", error);
        return apiError("Internal server error", 500);
    }
}
