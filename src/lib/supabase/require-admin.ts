import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<{ callerId: string } | null> {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) return null;
    const role = (claims.app_metadata as { role?: string } | undefined)?.role;
    if (role !== "administrator") return null;
    return { callerId: claims.sub };
}
