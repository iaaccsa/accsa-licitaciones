import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { apiError, safeLogError, validateUploadFile, validateUserName } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as Blob | null;

        if (!file) {
            return apiError("No file provided", 400);
        }

        const fileError = validateUploadFile(file);
        if (fileError) {
            return apiError(fileError, 400);
        }

        const env = getEnv();

        const url = `${env.API_BASE_URL}${env.API_ANALYSES_PATH}${env.API_ANALYSES_PATH.endsWith("/") ? "" : "/"}`;

        const backendFormData = new FormData();
        backendFormData.append("file", file, "licitacion_documentos.zip");

        const validatedName = validateUserName(formData.get("user_name"));
        if (validatedName) {
            backendFormData.append("user_name", validatedName);
        }

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-API-Key": env.BACKEND_API_KEY,
            },
            body: backendFormData,
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
        } else {
            safeLogError("upload", response.status, await response.text());
            return apiError("Failed to create analysis", response.status);
        }
    } catch (error) {
        console.error("Error processing upload:", error);
        return apiError("Internal server error", 500);
    }
}
