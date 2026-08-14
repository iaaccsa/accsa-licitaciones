import { createServerClient } from "@supabase/ssr";
import { asSessionCookie } from "./cookie-options";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthDisabled } from "@/lib/dev-auth";
import {
    ACTIVITY_COOKIE,
    ACTIVITY_COOKIE_MAX_AGE,
    INACTIVITY_ENABLED,
    INACTIVITY_TIMEOUT_MS,
} from "@/lib/session-timeout";

const PUBLIC_PATHS = ["/login", "/auth/confirm", "/api/auth/login", "/nerd-graph"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function clearAuthCookies(request: NextRequest, res: NextResponse) {
    for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith("sb-")) {
            res.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
        }
    }
}

function activityCookieOptions(request: NextRequest) {
    return {
        path: "/",
        httpOnly: true,
        sameSite: "lax" as const,
        secure: request.nextUrl.protocol === "https:",
        maxAge: ACTIVITY_COOKIE_MAX_AGE,
    };
}

function withSessionCookies(res: NextResponse, base: NextResponse): NextResponse {
    base.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
        const value = base.headers.get(header);
        if (value) res.headers.set(header, value);
    }
    return res;
}

export async function updateSession(request: NextRequest) {
    if (isAuthDisabled()) return NextResponse.next({ request });

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet, headers) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, asSessionCookie(options))
                    );
                    Object.entries(headers).forEach(([key, value]) =>
                        supabaseResponse.headers.set(key, value)
                    );
                },
            },
        }
    );

    // Do not run code between createServerClient and getClaims():
    // a subtle bug could make sessions randomly terminate.
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;

    const { pathname, search } = request.nextUrl;

    if (!claims && !isPublicPath(pathname)) {
        if (pathname.startsWith("/api/")) {
            return withSessionCookies(
                NextResponse.json({ error: "unauthorized" }, { status: 401 }),
                supabaseResponse
            );
        }
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", pathname + search);
        return withSessionCookies(NextResponse.redirect(loginUrl), supabaseResponse);
    }

    if (claims) {
        // Inactivity timeout, enforced server-side so protected data is never
        // served after the window. The activity cookie is bumped only by login
        // and the heartbeat endpoint (real user interaction), never by this
        // middleware on ordinary requests, so background polling cannot keep a
        // session alive.
        if (INACTIVITY_ENABLED && !isPublicPath(pathname)) {
            const now = Date.now();
            const raw = request.cookies.get(ACTIVITY_COOKIE)?.value;
            const last = raw ? Number(raw) : NaN;

            if (Number.isFinite(last) && now - last > INACTIVITY_TIMEOUT_MS) {
                // Idle too long: drop the session and force re-login. Build a
                // fresh response so the refreshed session cookies are NOT carried
                // over; clearAuthCookies then expires every sb-* cookie.
                const res = pathname.startsWith("/api/")
                    ? NextResponse.json({ error: "session_timeout" }, { status: 401 })
                    : NextResponse.redirect(new URL("/login?reason=timeout", request.url));
                clearAuthCookies(request, res);
                return res;
            }

            // Seed the cookie once for sessions predating this feature (or a
            // cleared cookie). A present-and-fresh cookie is left untouched.
            if (!Number.isFinite(last)) {
                supabaseResponse.cookies.set(
                    ACTIVITY_COOKIE,
                    String(now),
                    activityCookieOptions(request)
                );
            }
        }

        const role = (claims.app_metadata as { role?: string } | undefined)?.role;
        if (pathname.startsWith("/api/admin") && role !== "administrator") {
            return withSessionCookies(
                NextResponse.json({ error: "forbidden" }, { status: 403 }),
                supabaseResponse
            );
        }
        if (pathname.startsWith("/admin") && role !== "administrator") {
            return withSessionCookies(
                NextResponse.redirect(new URL("/", request.url)),
                supabaseResponse
            );
        }
    }

    return supabaseResponse;
}
