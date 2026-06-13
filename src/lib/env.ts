import { z } from "zod/v4";

const envSchema = z.object({
    API_BASE_URL: z.url(),
    BACKEND_API_KEY: z.string().min(1),
    API_ANALYSES_PATH: z.string().min(1),
    API_EVENTS_PATH: z.string().min(1),
    API_ORIGINAL_FILES_PATH: z.string().min(1),
    API_PROCESSED_FILES_PATH: z.string().min(1),
    API_PROPOSALS_PATH: z.string().min(1),
    API_REQUIREMENTS_PATH: z.string().min(1),
    API_WORKFLOW_STEPS_PATH: z.string().min(1),
    API_WORKFLOW_PHASES_PATH: z.string().min(1).optional(),
    API_COMPLIANCE_RESULTS_PATH: z.string().min(1),
    API_PROPOSAL_ECONOMIC_OFFERS_PATH: z.string().min(1).optional(),
    API_QDRANT_POINTS: z.string().min(1),
    API_UPLOAD_TOKEN_PATH: z.string().min(1),
    API_CHAT_PATH: z.string().min(1),
    API_CHAT_HISTORY_PATH: z.string().min(1),
    API_SETTINGS_PATH: z.string().min(1).optional(),
    API_AUDIT_LOGS_PATH: z.string().min(1).optional(),
    API_HEALTH_PATH: z.string().optional(),
    API_HEALTH_SUPABASE_PATH: z.string().optional(),
    API_HEALTH_QDRANT_PATH: z.string().optional(),
    API_HEALTH_AZURE_PATH: z.string().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    INVITE_ALLOWED_EMAIL_DOMAINS: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
    if (cachedEnv) return cachedEnv;

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const missing = z.treeifyError(result.error);
        console.error("Missing or invalid environment variables:", JSON.stringify(missing, null, 2));
        throw new Error("Server configuration error: missing environment variables");
    }

    cachedEnv = result.data;
    return cachedEnv;
}
