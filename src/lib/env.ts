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
    API_HEALTH_PATH: z.string().optional(),
    API_HEALTH_SUPABASE_PATH: z.string().optional(),
    API_HEALTH_QDRANT_PATH: z.string().optional(),
    API_HEALTH_AZURE_PATH: z.string().optional(),
    AUTH_PIN_HASH: z.string().regex(/^[a-f0-9]{64}$/, "AUTH_PIN_HASH must be sha256 hex (64 chars)"),
    AUTH_SESSION_SECRET: z.string().min(32, "AUTH_SESSION_SECRET must be at least 32 chars"),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(14400),
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
