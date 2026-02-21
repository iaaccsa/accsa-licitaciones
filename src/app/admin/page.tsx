import { Database, Server, Box, Cloud } from "lucide-react";

async function getHealth(path: string) {
    const baseUrl = process.env.API_BASE_URL;
    const apiKey = process.env.BACKEND_API_KEY;
    if (!baseUrl) return { status: "error", message: "API_BASE_URL not set" };

    try {
        const res = await fetch(`${baseUrl}${path}`, {
            cache: "no-store",
            headers: {
                "X-API-Key": apiKey || "",
            },
        });
        if (!res.ok) {
            return { status: "error", message: `HTTP error! status: ${res.status}` };
        }
        return res.json();
    } catch {
        return { status: "error", message: "Failed to fetch" };
    }
}

// Helper component for the status dot
function StatusDot({ status }: { status: string }) {
    const isHealthy = status === "ok";
    return (
        <span
            className={`flex w-3 h-3 rounded-full ml-2 ${isHealthy ? "bg-green-500" : "bg-red-500"
                }`}
        />
    );
}

export default async function AdminPage() {
    const healthPath = process.env.API_HEALTH_PATH || "/api/v1/health";
    const healthSupabasePath = process.env.API_HEALTH_SUPABASE_PATH || "/api/v1/health/supabase";
    const healthQdrantPath = process.env.API_HEALTH_QDRANT_PATH || "/api/v1/health/qdrant";
    const healthAzurePath = process.env.API_HEALTH_AZURE_PATH || "/api/v1/health/azure";

    const [healthApi, healthSupabase, healthQdrant, healthAzure] = await Promise.all([
        getHealth(healthPath),
        getHealth(healthSupabasePath),
        getHealth(healthQdrantPath),
        getHealth(healthAzurePath),
    ]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-zinc-900 font-serif italic mb-2">
                    Panel de Administración
                </h1>
                <p className="text-zinc-500">
                    Estado del sistema y diagnósticos.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* API Health Card */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                            <Server className="w-6 h-6" />
                        </div>
                        <div className="flex items-center">
                            <h2 className="text-lg font-semibold text-zinc-800">Estado del API</h2>
                            <StatusDot status={healthApi.status} />
                        </div>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-4 font-mono text-sm overflow-auto max-h-60 border border-zinc-100">
                        <pre>{JSON.stringify(healthApi, null, 2)}</pre>
                    </div>
                </div>

                {/* Supabase Health Card */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                            <Database className="w-6 h-6" />
                        </div>
                        <div className="flex items-center">
                            <h2 className="text-lg font-semibold text-zinc-800">Estado de Supabase</h2>
                            <StatusDot status={healthSupabase.status} />
                        </div>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-4 font-mono text-sm overflow-auto max-h-60 border border-zinc-100">
                        <pre>{JSON.stringify(healthSupabase, null, 2)}</pre>
                    </div>
                </div>

                {/* Qdrant Health Card */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
                            <Box className="w-6 h-6" />
                        </div>
                        <div className="flex items-center">
                            <h2 className="text-lg font-semibold text-zinc-800">Estado de Qdrant</h2>
                            <StatusDot status={healthQdrant.status} />
                        </div>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-4 font-mono text-sm overflow-auto max-h-60 border border-zinc-100">
                        <pre>{JSON.stringify(healthQdrant, null, 2)}</pre>
                    </div>
                </div>

                {/* Azure Health Card */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                            <Cloud className="w-6 h-6" />
                        </div>
                        <div className="flex items-center">
                            <h2 className="text-lg font-semibold text-zinc-800">Estado de Azure</h2>
                            <StatusDot status={healthAzure.status} />
                        </div>
                    </div>

                    <div className="bg-zinc-50 rounded-lg p-4 font-mono text-sm overflow-auto max-h-60 border border-zinc-100">
                        <pre>{JSON.stringify(healthAzure, null, 2)}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
