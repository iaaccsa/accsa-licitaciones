import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ password: z.string().min(6) });

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_password_format" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
        if (error.code === "same_password") {
            return NextResponse.json({ error: "same_password" }, { status: 400 });
        }
        if (error.code === "weak_password") {
            return NextResponse.json({ error: "weak_password" }, { status: 400 });
        }
        return NextResponse.json({ error: "update_failed" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}
