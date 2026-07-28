import type { NextConfig } from "next";
import { readFileSync } from "fs";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const { version: appVersion } = JSON.parse(
    readFileSync("./package.json", "utf8"),
);

const securityHeaders = [
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            `connect-src 'self' https: ${apiBaseUrl}`.trim(),
            "font-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join("; "),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
    // Next 16 keeps a lockfile inside distDir that rejects a second `next dev`
    // in the same project. The Playwright e2e webServer sets NEXT_DIST_DIR so
    // it can run alongside the regular dev server without lock/artifact clashes.
    distDir: process.env.NEXT_DIST_DIR || ".next",
    env: {
        NEXT_PUBLIC_APP_VERSION: appVersion,
    },
    turbopack: {
        root: __dirname,
    },
    experimental: {
        optimizePackageImports: ["lucide-react"],
    },
    headers: async () => [
        {
            source: "/(.*)",
            headers: securityHeaders,
        },
    ],
};

export default nextConfig;
