import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthDisabled } from "@/lib/dev-auth";
import { ACTIVITY_COOKIE, ACTIVITY_COOKIE_MAX_AGE } from "@/lib/session-timeout";

// Called by the client on genuine user interaction (throttled) to refresh the
// server-side last-activity marker. If the session is already past the timeout
// the middleware 401s this request before it runs, which is correct.
export async function POST() {
    if (isAuthDisabled()) return NextResponse.json({ ok: true });

    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ACTIVITY_COOKIE_MAX_AGE,
    });
    return res;
}
