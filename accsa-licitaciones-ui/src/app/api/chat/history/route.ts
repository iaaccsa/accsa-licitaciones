import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError } from "@/lib/api-utils";
import { requireAnalysisAccess } from "@/lib/supabase/require-analysis-access";

const historyRequestSchema = z.object({
    analysis_id: z.string().uuid(),
    session_id: z.string().uuid().optional(),
    file_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
    try {
        const env = getEnv();
        const rawBody = await request.json();

        const parsed = historyRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return apiError("Invalid request body", 400);
        }

        if (!(await requireAnalysisAccess(parsed.data.analysis_id))) {
            return apiError("Analysis not found", 404);
        }

        const response = await fetch(`${env.API_BASE_URL}${env.API_CHAT_HISTORY_PATH}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(parsed.data),
        });

        const data = await response.json();

        if (!response.ok) {
            safeLogError("chat-history", response.status, JSON.stringify(data));
            return apiError("Failed to fetch chat history", response.status);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching chat history:", error);
        return apiError("Internal server error", 500);
    }
}
