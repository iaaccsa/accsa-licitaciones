import { NextRequest, NextResponse } from "next/server";
import { validateUUID, invalidIdResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/require-admin";

// Invite links expire and there is no resend API for invites:
// implemented as delete + re-invite, preserving the assigned role.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    if (!validateUUID(userId)) {
        return invalidIdResponse();
    }

    const admin = createAdminClient();

    const { data: existing, error: getError } = await admin.auth.admin.getUserById(userId);
    if (getError || !existing.user.email) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    if (existing.user.email_confirmed_at) {
        return NextResponse.json({ error: "already_active" }, { status: 400 });
    }

    const email = existing.user.email;
    const role =
        (existing.user.app_metadata as { role?: string } | undefined)?.role ?? "user";

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
        return NextResponse.json({ error: "resend_failed" }, { status: 500 });
    }

    const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
        return NextResponse.json({ error: "resend_failed" }, { status: 500 });
    }

    const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role },
    });
    if (roleError) {
        return NextResponse.json({ error: "role_assignment_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
