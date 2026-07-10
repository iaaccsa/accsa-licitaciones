/**
 * Development-only auth bypass, controlled by AUTH_DISABLED=true in .env.local.
 * Double lock: also requires NODE_ENV=development (pnpm dev), so the flag is
 * inert in production builds (Vercel) even if the env var is present.
 */
export function isAuthDisabled(): boolean {
    return (
        process.env.NODE_ENV === "development" &&
        process.env.AUTH_DISABLED === "true"
    );
}

export const DEV_USER = {
    id: "00000000-0000-0000-0000-000000000000",
    email: "dev@localhost",
} as const;
