import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/require-admin";

const bodySchema = z.object({
    email: z.email(),
    role: z.enum(["administrator", "user"]),
});

export async function POST(req: NextRequest) {
    const caller = await requireAdmin();
    if (!caller) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const { email, role } = parsed.data;

    const allowedDomains = (getEnv().INVITE_ALLOWED_EMAIL_DOMAINS ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
        return NextResponse.json({ error: "domain_not_allowed" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error) {
        if (error.code === "email_exists") {
            return NextResponse.json({ error: "email_exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "invite_failed" }, { status: 500 });
    }

    // inviteUserByEmail cannot set app_metadata (its `data` option goes to user_metadata)
    const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role },
    });
    if (roleError) {
        return NextResponse.json({ error: "role_assignment_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
