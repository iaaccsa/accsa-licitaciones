"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { Skeleton } from "@/components/ui/skeleton";

interface Analysis {
    slug: string;
    user_assigned_name: string | null;
    generated_name: string | null;
}

interface Proposal {
    id: string;
    label: string;
    provider_name: string | null;
}

const SEGMENT_LABELS: Record<string, string> = {
    requirements: "Requisitos",
    admissibility: "Admisibilidad",
    files: "Archivos",
    flow: "Flujo",
    proposals: "Propuestas",
    chat: "Chat",
    chunks: "Chunks",
};

const NAME_MAX_CHARS = 40;

function truncateName(name: string) {
    return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS)}...` : name;
}

export function AnalysisBreadcrumb() {
    const { id, fileId, proposalId } = useParams<{
        id: string;
        fileId?: string;
        proposalId?: string;
    }>();
    const pathname = usePathname();

    const { data: analysis } = useSWR<Analysis>(`/api/analyses/${id}`, fetcher, {
        revalidateOnFocus: false,
    });
    const { data: proposals } = useSWR<Proposal[]>(
        proposalId ? `/api/analyses/${id}/proposals` : null,
        fetcher,
        { revalidateOnFocus: false },
    );

    const basePath = `/analyses/${id}`;
    const analysisName = analysis
        ? truncateName(analysis.user_assigned_name || analysis.generated_name || analysis.slug)
        : null;

    const items: { label: ReactNode; href: string }[] = [
        { label: "Análisis", href: "/analyses" },
        {
            label: analysisName ?? <Skeleton className="inline-block h-3.5 w-40 align-middle" />,
            href: basePath,
        },
    ];

    const segments = pathname.startsWith(basePath)
        ? pathname.slice(basePath.length).split("/").filter(Boolean)
        : [];

    let href = basePath;
    for (const segment of segments) {
        href += `/${segment}`;
        // /files/[fileId] has no page of its own: skip the crumb, keep the path.
        if (segment === fileId) continue;
        if (segment === proposalId) {
            const proposal = proposals?.find((p) => p.id === proposalId);
            items.push({
                label: truncateName(proposal?.label || proposal?.provider_name || "Propuesta"),
                href,
            });
        } else if (segment === "requirements" && proposalId) {
            items.push({ label: "Matriz de Cumplimiento", href });
        } else {
            items.push({ label: SEGMENT_LABELS[segment] ?? segment, href });
        }
    }

    return (
        <nav aria-label="Breadcrumb" className="max-w-6xl mx-auto px-4 pt-4">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    return (
                        <Fragment key={item.href}>
                            {index > 0 && (
                                <li aria-hidden="true" className="text-zinc-300 dark:text-zinc-600 select-none">
                                    /
                                </li>
                            )}
                            <li>
                                {isLast ? (
                                    <span aria-current="page" className="text-zinc-400 dark:text-zinc-500">
                                        {item.label}
                                    </span>
                                ) : (
                                    <Link
                                        href={item.href}
                                        className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                    >
                                        {item.label}
                                    </Link>
                                )}
                            </li>
                        </Fragment>
                    );
                })}
            </ol>
        </nav>
    );
}
