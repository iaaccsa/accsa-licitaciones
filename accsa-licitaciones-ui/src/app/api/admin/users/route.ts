import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/require-admin";

export async function GET() {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (error) {
        return NextResponse.json({ error: "list_failed" }, { status: 500 });
    }

    const users = data.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        role: (u.app_metadata as { role?: string } | undefined)?.role ?? "user",
        pending: !u.email_confirmed_at,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
    }));

    return NextResponse.json({ users, caller_id: caller.callerId });
}
