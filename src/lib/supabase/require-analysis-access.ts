import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireAnalysisAccess(analysisId: string): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) return false;
    const role = (claims.app_metadata as { role?: string } | undefined)?.role;
    if (role === "administrator") return true;
    const admin = createAdminClient();
    const { data: row } = await admin
        .from("analyses")
        .select("created_by")
        .eq("id", analysisId)
        .maybeSingle();
    return row?.created_by === claims.sub;
}

export async function requireEntityAnalysisAccess(
    table: string,
    entityId: string
): Promise<boolean> {
    const admin = createAdminClient();
    const { data: row } = await admin
        .from(table)
        .select("analysis_id")
        .eq("id", entityId)
        .maybeSingle();
    if (!row?.analysis_id) return false;
    return requireAnalysisAccess(row.analysis_id);
}
