import { test, expect } from "@playwright/test";
import { expectViewRenders } from "./helpers";

test("auth bypass is active on the target server", async ({ request }) => {
    const response = await request.get("/api/auth/me");
    expect(
        response.status(),
        "expected 200 from /api/auth/me; the target server must run with AUTH_DISABLED=true",
    ).toBe(200);
    expect(await response.json()).toEqual({ email: "dev@localhost" });
});

const STATIC_ROUTES = [
    "/",
    "/new",
    "/ayuda",
    "/changelog",
    "/terms",
    "/login",
    "/auth/confirm",
    "/auth/set-password",
    "/nerd-graph",
    "/admin",
    "/admin/cleanup",
    "/admin/config",
    "/admin/config/human-loop",
    "/admin/config/infra-config",
    "/admin/config/llm-config",
    "/admin/config/notifications",
    "/admin/config/prompts",
    "/admin/config/users",
    "/admin/review",
    "/admin/review/audit",
    "/admin/review/status",
];

for (const route of STATIC_ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
        await expectViewRenders(page, route);
    });
}

// Redirect stubs, not real views.
const REDIRECTS = [
    { from: "/analyses", to: "/" },
    { from: "/admin/analyses", to: "/admin" },
];

for (const { from, to } of REDIRECTS) {
    test(`redirects ${from} to ${to}`, async ({ page }) => {
        await expectViewRenders(page, from, to);
    });
}
