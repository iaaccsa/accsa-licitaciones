import { createClient } from "@/lib/supabase/server";

/**
 * Trusted identity headers forwarded to the backend for audit logging.
 * X-User-Id / X-User-Email come from the server-side Supabase session.
 * X-Forwarded-For / User-Agent are forwarded from the incoming request.
 * Returns an empty-ish object when there is no session (system context).
 */
export async function getAuditHeaders(request?: Request): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    try {
        const supabase = await createClient();
        const { data } = await supabase.auth.getClaims();
        const claims = data?.claims;
        if (claims?.sub) headers["X-User-Id"] = claims.sub;
        if (claims?.email) headers["X-User-Email"] = claims.email;
    } catch {
        // no session (service/system context) — leave actor headers empty
    }

    if (request) {
        const xff = request.headers.get("x-forwarded-for");
        if (xff) headers["X-Forwarded-For"] = xff;
        const ua = request.headers.get("user-agent");
        if (ua) headers["User-Agent"] = ua;
    }

    return headers;
}
