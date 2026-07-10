import { defineConfig, devices } from "@playwright/test";

// Dedicated port + distDir so the e2e dev server can run alongside the regular
// `pnpm dev` on :3000 (Next 16 rejects two dev servers sharing one distDir).
// Set E2E_BASE_URL to test against an already-running server instead; it must
// have AUTH_DISABLED=true active.
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: { timeout: 15_000 },
    retries: process.env.CI ? 2 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL,
        navigationTimeout: 30_000,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: `pnpm dev --port ${PORT}`,
              url: `http://localhost:${PORT}`,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
              env: {
                  AUTH_DISABLED: "true",
                  NEXT_DIST_DIR: ".next-e2e",
              },
          },
});
