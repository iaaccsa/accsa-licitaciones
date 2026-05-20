import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const ok = token ? await verifySession(token) : false;
    if (ok) return NextResponse.next();

    const { pathname, search } = request.nextUrl;

    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        "/((?!login|api/auth/login|api/auth/logout|_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
    ],
};
