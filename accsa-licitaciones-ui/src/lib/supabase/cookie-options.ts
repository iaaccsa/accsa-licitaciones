// @supabase/ssr writes the auth cookies with maxAge 400 days, so a session
// survived closing and reopening the browser. Dropping maxAge and expires turns
// them into session cookies, which the browser discards on exit.
//
// This is only about closing the browser. The inactivity timeout is enforced
// separately by the sb-activity cookie and the middleware, and keeps its own
// max-age on purpose.
export function asSessionCookie<T extends { maxAge?: number; expires?: Date }>(
    options: T,
): T {
    const sessionOptions = { ...options };
    delete sessionOptions.maxAge;
    delete sessionOptions.expires;
    return sessionOptions;
}
