"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
    CHECK_INTERVAL_MS,
    HEARTBEAT_INTERVAL_MS,
    INACTIVITY_ENABLED,
    INACTIVITY_TIMEOUT_MS,
} from "@/lib/session-timeout";

const ACTIVITY_EVENTS = [
    "pointerdown",
    "keydown",
    "mousemove",
    "wheel",
    "scroll",
    "touchstart",
] as const;

// Watches for genuine user interaction and logs the user out after the
// inactivity window. This is the UX half; the middleware enforces the same
// timeout server-side so protected data is blocked even if this never runs.
export function InactivityWatcher() {
    const pathname = usePathname();
    const enabled =
        INACTIVITY_ENABLED &&
        !(pathname === "/login" || pathname.startsWith("/auth"));

    // Seeded by markActive() on mount (kept out of render to stay pure).
    const lastActivity = useRef(0);
    const lastBeat = useRef(0);
    const loggedOut = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        function markActive() {
            const now = Date.now();
            lastActivity.current = now;
            if (now - lastBeat.current >= HEARTBEAT_INTERVAL_MS) {
                lastBeat.current = now;
                fetch("/api/auth/heartbeat", { method: "POST" }).catch(() => {});
            }
        }

        for (const evt of ACTIVITY_EVENTS) {
            window.addEventListener(evt, markActive, { passive: true });
        }

        const timer = setInterval(() => {
            if (loggedOut.current) return;
            if (Date.now() - lastActivity.current < INACTIVITY_TIMEOUT_MS) return;
            loggedOut.current = true;
            fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                window.location.href = "/login?reason=timeout";
            });
        }, CHECK_INTERVAL_MS);

        // Refresh the server marker on load (a page load is user activity).
        markActive();

        return () => {
            for (const evt of ACTIVITY_EVENTS) {
                window.removeEventListener(evt, markActive);
            }
            clearInterval(timer);
        };
    }, [enabled]);

    return null;
}
