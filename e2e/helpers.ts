import { expect, type Page } from "@playwright/test";

// Smoke assertion shared by all view tests: the route responds 200, is not
// bounced to /login (auth bypass must be active), renders the app shell, and
// throws no uncaught runtime errors during load.
export async function expectViewRenders(
    page: Page,
    path: string,
    resolvesTo: string = path,
) {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const response = await page.goto(path);

    expect(response, `no response for ${path}`).not.toBeNull();
    expect(response!.status(), `HTTP status for ${path}`).toBe(200);
    expect(
        new URL(page.url()).pathname,
        `unexpected redirect (to /login it means AUTH_DISABLED=true is not active on the target server)`,
    ).toBe(resolvesTo);

    // The footer repeats the brand text and the /ayuda sidebar nav contains a
    // longer variant, so anchor to a navigation role and match exactly.
    await expect(
        page
            .getByRole("navigation")
            .getByText("Asistente de Compras Estatales", { exact: true }),
        `app shell (navbar) not rendered on ${path}`,
    ).toBeVisible();

    expect(
        pageErrors.map((error) => error.message),
        `uncaught runtime errors on ${path}`,
    ).toEqual([]);
}
