import { LucideIcon } from "lucide-react";

export function MetricBox({ icon: Icon, value, label }: { icon: LucideIcon; value: number | null; label: string }) {
    return (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-lg p-3 flex flex-col justify-end">
            <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-none">
                    {value || 0}
                </span>
            </div>
            <span className="text-[10px] uppercase font-medium text-zinc-500 dark:text-zinc-400">
                {label}
            </span>
        </div>
    );
}
