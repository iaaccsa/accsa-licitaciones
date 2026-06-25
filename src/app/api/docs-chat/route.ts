import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";

const docsChatSchema = z.object({
    message: z.string().min(1).max(4000),
    conversation_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
    try {
        const env = getEnv();
        if (!env.CHATBOT_DOCS_URL || !env.CHATBOT_DOCS_API_KEY) {
            return apiError("Documentation chatbot is not configured", 503);
        }

        const rawBody = await request.json();
        const parsed = docsChatSchema.safeParse(rawBody);
        if (!parsed.success) {
            return apiError("Invalid request body", 400);
        }

        // Inject the session user id server-side; never trust the browser for it.
        const supabase = await createClient();
        const { data } = await supabase.auth.getClaims();
        const userId = data?.claims?.sub;

        const baseUrl = env.CHATBOT_DOCS_URL.replace(/\/+$/, "");
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.CHATBOT_DOCS_API_KEY,
            },
            body: JSON.stringify({ ...parsed.data, user_id: userId }),
        });

        const respData = await response.json();

        if (!response.ok) {
            safeLogError("docs-chat", response.status, JSON.stringify(respData));
            return apiError("Documentation chat request failed", response.status);
        }

        return NextResponse.json(respData);
    } catch (error) {
        console.error("Error calling docs-chat endpoint:", error);
        return apiError("Internal server error", 500);
    }
}
