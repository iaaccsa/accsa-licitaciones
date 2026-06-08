import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { validateUUID, invalidIdResponse, apiError, safeLogError } from "@/lib/api-utils";

const ADMISSIBILITY_RESULTS_PATH = "/api/v1/admissibility-results";

const ALLOWED_VERDICTS = new Set([
    "cumple", "cumple_parcial", "no_cumple",
    "no_evidencia", "no_aplica", "requiere_verificacion_manual",
]);
const ALLOWED_CONFIDENCE = new Set(["alta", "media", "baja", "muy_baja"]);

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ entryId: string }> }
) {
    const { entryId } = await params;

    if (!validateUUID(entryId)) {
        return invalidIdResponse();
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return apiError("Invalid JSON body", 400);
    }

    const patch: Record<string, unknown> = {};

    if (body.verdict !== undefined && body.verdict !== null) {
        if (!ALLOWED_VERDICTS.has(body.verdict as string)) {
            return apiError("Invalid verdict value", 400);
        }
        patch.verdict = body.verdict;
    }
    if (body.confidence !== undefined && body.confidence !== null) {
        if (!ALLOWED_CONFIDENCE.has(body.confidence as string)) {
            return apiError("Invalid confidence value", 400);
        }
        patch.confidence = body.confidence;
    }
    if (typeof body.reasoning === "string" || body.reasoning === null) patch.reasoning = body.reasoning;
    if (typeof body.notes === "string" || body.notes === null) patch.notes = body.notes;
    if (typeof body.reviewed_by === "string" || body.reviewed_by === null) patch.reviewed_by = body.reviewed_by;
    if (typeof body.is_verified === "boolean") patch.is_verified = body.is_verified;
    if (typeof body.manual_verification_required === "boolean") patch.manual_verification_required = body.manual_verification_required;
    if (Array.isArray(body.missing_elements)) patch.missing_elements = body.missing_elements;

    try {
        const env = getEnv();
        const url = `${env.API_BASE_URL}${ADMISSIBILITY_RESULTS_PATH}/${entryId}`;

        const res = await fetch(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: JSON.stringify(patch),
        });

        if (!res.ok) {
            safeLogError("admissibility-results/patch", res.status, res.statusText);
            return apiError("Failed to update admissibility result", res.status);
        }

        return NextResponse.json(await res.json());
    } catch (error) {
        console.error("Error in admissibility-results PATCH route:", error);
        return apiError("Internal server error", 500);
    }
}
