import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { SESSION_COOKIE, signSession, verifyPin } from "@/lib/auth";
import { getEnv } from "@/lib/env";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

type Entry = { count: number; resetAt: number };
const attempts = new Map<string, Entry>();

function rateLimitKey(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}

function checkRate(key: string): boolean {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || entry.resetAt < now) {
        attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count += 1;
    return true;
}

const bodySchema = z.object({ pin: z.string().regex(/^\d{8}$/) });

export async function POST(req: NextRequest) {
    const key = rateLimitKey(req);
    if (!checkRate(key)) {
        return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_pin_format" }, { status: 400 });
    }

    if (!verifyPin(parsed.data.pin)) {
        return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
    }

    const token = await signSession();
    const maxAge = getEnv().AUTH_SESSION_TTL_SECONDS;
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge,
    });
    return res;
}
