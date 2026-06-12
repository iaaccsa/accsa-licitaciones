import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/confirm", "/api/auth/login"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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
                        supabaseResponse.cookies.set(name, value, options)
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
