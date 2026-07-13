"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

function getPageItems(current: number, total: number): (number | "ellipsis")[] {
    const pages: number[] = [];
    for (let p = 1; p <= total; p++) {
        if (p <= 3 || p > total - 2 || Math.abs(p - current) <= 1) pages.push(p);
    }
    const result: (number | "ellipsis")[] = [];
    let prev = 0;
    for (const p of pages) {
        if (prev && p - prev === 2) result.push(prev + 1);
        else if (prev && p - prev > 2) result.push("ellipsis");
        result.push(p);
        prev = p;
    }
    return result;
}

export function Pagination({ page, totalPages, onPageChange }: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}) {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-center gap-4 pt-2">
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:text-zinc-300 dark:disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Previo
            </button>
            <div className="flex items-center gap-1">
                {getPageItems(page, totalPages).map((item, i) =>
                    item === "ellipsis" ? (
                        <span key={`e-${i}`} className="px-2 text-sm text-zinc-400 dark:text-zinc-500">...</span>
                    ) : (
                        <button
                            key={item}
                            onClick={() => onPageChange(item)}
                            className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-colors ${item === page
                                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                }`}
                        >
                            {item}
                        </button>
                    )
                )}
            </div>
            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:text-zinc-300 dark:disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
            >
                Siguiente
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}
