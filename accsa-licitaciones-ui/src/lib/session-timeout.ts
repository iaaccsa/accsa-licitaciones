// Inactivity timeout config shared by the middleware (server-side enforcement)
// and the InactivityWatcher (client-side logout). Only reads NEXT_PUBLIC_* so it
// is safe to import from both the Edge middleware and client components.
//
// Set NEXT_PUBLIC_INACTIVITY_TIMEOUT_MINUTES to 0 to disable the feature.

const raw = process.env.NEXT_PUBLIC_INACTIVITY_TIMEOUT_MINUTES;
const minutes = raw == null || raw === "" ? 30 : Number(raw);

export const INACTIVITY_TIMEOUT_MINUTES = Number.isFinite(minutes) ? minutes : 30;
export const INACTIVITY_ENABLED = INACTIVITY_TIMEOUT_MINUTES > 0;
export const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MINUTES * 60_000;

// How often the client re-checks the idle timer.
export const CHECK_INTERVAL_MS = 15_000;
// Minimum gap between server heartbeats while the user is active. Keeps the
// server-side activity cookie fresh without spamming a request per mousemove.
export const HEARTBEAT_INTERVAL_MS = 60_000;

// Last-activity cookie, bumped ONLY by login + heartbeat (never by background
// polling), and read by the middleware to enforce the timeout server-side.
export const ACTIVITY_COOKIE = "sb-activity";
// Outlives the timeout on purpose: after a browser restart the cookie is still
// present but STALE, which forces logout. If it merely expired, an absent cookie
// would be re-seeded and the session would survive the restart.
export const ACTIVITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
