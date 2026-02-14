"use client";

import { Clock } from "lucide-react";

interface JobStatus {
    id: string;
    status: string;
    is_success: boolean | null;
    input_path: string;
    output_path: string | null;
    error_details: string | null;
    created_at: string;
    updated_at: string;
}

function getStatusColor(status: string, isSuccess: boolean | null): string {
    switch (status.toLowerCase()) {
        case "ready":
            if (isSuccess === true) {
                return "text-green-600 bg-green-100";
            } else if (isSuccess === false) {
                return "text-red-600 bg-red-100";
            }
            return "text-green-600 bg-green-100";
        case "pending":
            return "text-yellow-600 bg-yellow-100";
        case "processing":
            return "text-blue-600 bg-blue-100";
        default:
            return "text-zinc-600 bg-zinc-100";
    }
}

// Static SVG hoisted outside the component to avoid re-creation on every render
const DownloadIcon = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
    </svg>
);

export type { JobStatus };

export function JobStatusDisplay({ jobStatus }: { jobStatus: JobStatus }) {
    return (
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-700">Resultado</span>
                    <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(jobStatus.status, jobStatus.is_success)}`}
                    >
                        {jobStatus.status}
                    </span>
                </div>
            </div>
            <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-32">ID:</span>
                    <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-700">
                        {jobStatus.id}
                    </code>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-32">Creado:</span>
                    <span className="text-zinc-700 flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(jobStatus.created_at).toLocaleString()}
                    </span>
                </div>
                {jobStatus.is_success !== null ? (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-500 w-32">Éxito:</span>
                        <span
                            className={
                                jobStatus.is_success ? "text-green-600" : "text-red-600"
                            }
                        >
                            {jobStatus.is_success ? "Sí" : "No"}
                        </span>
                    </div>
                ) : null}
                {jobStatus.output_path ? (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-500 w-32">Resultado:</span>
                        <a
                            href={jobStatus.output_path}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                            {DownloadIcon}
                            Descargar Resultado
                        </a>
                    </div>
                ) : null}
                {jobStatus.error_details ? (
                    <div className="flex items-start gap-2 text-sm">
                        <span className="text-zinc-500 w-32">Error:</span>
                        <span className="text-red-600">{jobStatus.error_details}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
