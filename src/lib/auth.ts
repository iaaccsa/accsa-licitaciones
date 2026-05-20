import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "session";

function secretKey(): Uint8Array {
    return new TextEncoder().encode(getEnv().AUTH_SESSION_SECRET);
}

export function hashPin(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
}

export function verifyPin(pin: string): boolean {
    const expected = getEnv().AUTH_PIN_HASH;
    const actual = hashPin(pin);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export async function signSession(): Promise<string> {
    const ttl = getEnv().AUTH_SESSION_TTL_SECONDS;
    return await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .sign(secretKey());
}

export async function verifySession(token: string): Promise<boolean> {
    try {
        await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
        return true;
    } catch {
        return false;
    }
}
