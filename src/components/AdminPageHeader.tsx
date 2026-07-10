import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AdminPageHeader({
    backHref,
    title,
    description,
}: {
    backHref: string;
    title: string;
    description?: string;
}) {
    return (
        <div className="mb-6">
            <div className="flex items-center gap-3">
                <Link
                    href={backHref}
                    aria-label="Volver"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 font-serif italic">
                    {title}
                </h1>
            </div>
            {description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{description}</p>}
        </div>
    );
}
