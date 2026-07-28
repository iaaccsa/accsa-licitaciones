import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthDisabled, DEV_USER } from "@/lib/dev-auth";

export async function GET() {
    if (isAuthDisabled()) return NextResponse.json({ email: DEV_USER.email });
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const email = data?.claims?.email;
    if (!email) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ email });
}
