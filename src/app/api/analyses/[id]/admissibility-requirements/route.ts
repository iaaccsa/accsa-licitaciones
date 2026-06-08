import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

const ADMISSIBILITY_REQUIREMENTS_PATH = "/api/v1/admissibility-requirements";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!validateUUID(id)) {
        return invalidIdResponse();
    }

    try {
        const env = getEnv();
        const search = request.nextUrl.searchParams;
        const upstream = new URL(`${env.API_BASE_URL}${ADMISSIBILITY_REQUIREMENTS_PATH}/${id}`);

        const domain = search.get("domain");
        if (domain) upstream.searchParams.set("domain", domain);

        const role = search.get("role");
        if (role) upstream.searchParams.set("role", role);

        const isVerified = search.get("is_verified");
        if (isVerified === "true" || isVerified === "false") {
            upstream.searchParams.set("is_verified", isVerified);
        }

        upstream.searchParams.set("limit", search.get("limit") ?? "50");
        upstream.searchParams.set("offset", search.get("offset") ?? "0");

        const res = await fetch(upstream.toString(), {
            headers: { "X-API-Key": env.BACKEND_API_KEY },
        });

        if (!res.ok) {
            safeLogError("admissibility-requirements", res.status, res.statusText);
            return apiError("Failed to fetch admissibility requirements", res.status);
        }

        return NextResponse.json(await res.json());
    } catch (error) {
        console.error("Error fetching admissibility requirements:", error);
        return apiError("Internal server error", 500);
    }
}
