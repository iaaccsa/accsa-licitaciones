import { NextResponse } from "next/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(id: string): boolean {
    return UUID_REGEX.test(id);
}

export function invalidIdResponse() {
    return NextResponse.json(
        { error: "Invalid ID format" },
        { status: 400 }
    );
}

export function apiError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export function safeLogError(context: string, status: number, errorText: string) {
    console.error(`[${context}] Backend responded with status ${status} (${errorText.length} chars)`);
}

const MAX_USER_NAME_LENGTH = 200;
const USER_NAME_REGEX = /^[\p{L}\p{N}\s\-_.,:;()&/]+$/u;

export function validateUserName(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > MAX_USER_NAME_LENGTH) return null;
    if (!USER_NAME_REGEX.test(trimmed)) return null;
    return trimmed;
}

const STORAGE_PATH_REGEX = /^[a-zA-Z0-9/_\-][a-zA-Z0-9/_\-.]*$/;

export function isValidStoragePath(path: string): boolean {
    if (!path || path.length > 500) return false;
    if (path.includes("..") || path.includes("//")) return false;
    return STORAGE_PATH_REGEX.test(path);
}

const MAX_UPLOAD_SIZE = 260 * 1024 * 1024; // 260 MB
const ALLOWED_ZIP_TYPES = [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-zip",
    "application/octet-stream",
];

export function validateUploadFile(file: Blob): string | null {
    if (file.size > MAX_UPLOAD_SIZE) {
        return "File exceeds maximum size of 260 MB";
    }
    if (file.type && !ALLOWED_ZIP_TYPES.includes(file.type)) {
        return `Invalid file type: ${file.type}`;
    }
    return null;
}

export function parsePaginationBody(
    body: unknown
): { limit: number; offset: number } {
    if (body && typeof body === "object" && body !== null) {
        const obj = body as Record<string, unknown>;
        const limit = typeof obj.limit === "number" && obj.limit > 0 && obj.limit <= 100
            ? Math.floor(obj.limit) : 10;
        const offset = typeof obj.offset === "number" && obj.offset >= 0
            ? Math.floor(obj.offset) : 0;
        return { limit, offset };
    }
    return { limit: 10, offset: 0 };
}
