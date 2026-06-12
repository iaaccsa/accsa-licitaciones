import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { validateUUID, invalidIdResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/require-admin";

const patchSchema = z.object({
    role: z.enum(["administrator", "user"]),
});

export async function PATCH(
    req: NextRequest,
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

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (userId === caller.callerId && parsed.data.role !== "administrator") {
        return NextResponse.json({ error: "cannot_degrade_self" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { role: parsed.data.role },
    });

    if (error) {
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}

export async function DELETE(
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

    if (userId === caller.callerId) {
        return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
        return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
