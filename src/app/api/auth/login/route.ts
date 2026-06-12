import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_credentials_format" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
        if (error.status === 429) {
            return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
        }
        return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
}
