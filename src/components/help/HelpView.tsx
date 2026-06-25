"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { BookOpen, Search, X, LifeBuoy } from "lucide-react";
import type { HelpSection } from "@/lib/help/loader";

const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
}

export function HelpView({ sections }: { sections: HelpSection[] }) {
    const [query, setQuery] = useState("");
    const [activeId, setActiveId] = useState<string>(
        sections[0]?.fragments[0]?.id ?? "",
    );
    const contentRef = useRef<HTMLDivElement>(null);

    const idToTitle = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of sections) for (const f of s.fragments) m.set(f.id, f.title);
        return m;
    }, [sections]);

    // Turn the wiki-style [[id]] cross-links into in-page anchor links.
    const resolveWikiLinks = (body: string) =>
        body.replace(/\[\[([a-z0-9-]+)\]\]/g, (_, id) => {
            const title = idToTitle.get(id);
            return title ? `[${title}](#${id})` : id;
        });

    const filtered = useMemo(() => {
        const q = norm(query.trim());
        if (!q) return sections;
        return sections
            .map((s) => ({
                ...s,
                fragments: s.fragments.filter(
                    (f) =>
                        norm(f.title).includes(q) ||
                        f.keywords.some((k) => norm(k).includes(q)) ||
                        norm(f.body).includes(q),
                ),
            }))
            .filter((s) => s.fragments.length > 0);
    }, [sections, query]);

    const flatIds = useMemo(
        () => filtered.flatMap((s) => s.fragments.map((f) => f.id)),
        [filtered],
    );

    // Scroll spy: highlight the fragment currently near the top.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
                    );
                if (visible[0]) setActiveId(visible[0].target.id);
            },
            { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
        );
        const nodes = contentRef.current?.querySelectorAll("section[data-help-id]");
        nodes?.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [flatIds]);

    const markdownComponents = useMemo(
        () => ({
            a: ({
                href,
                children,
            }: {
                href?: string;
                children?: React.ReactNode;
            }) => {
                if (href?.startsWith("#")) {
                    return (
                        <a
                            href={href}
                            onClick={(e) => {
                                e.preventDefault();
                                scrollToId(href.slice(1));
                            }}
                            className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                        >
                            {children}
                        </a>
                    );
                }
                return (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                    >
                        {children}
                    </a>
                );
            },
        }),
        [],
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic flex items-center gap-2">
                    <LifeBuoy className="w-6 h-6 text-blue-600" />
                    Centro de ayuda
                </h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Guía de uso del Asistente de Compras Estatales.
                </p>
            </div>

            <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
                {/* Sidebar */}
                <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto mb-6 lg:mb-0">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar en la ayuda..."
                            className="w-full pl-9 pr-9 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                                aria-label="Limpiar búsqueda"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {filtered.length === 0 ? (
                        <p className="text-sm text-zinc-400 px-1">Sin resultados.</p>
                    ) : (
                        <nav className="space-y-5">
                            {filtered.map((section) => (
                                <div key={section.name}>
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 px-1">
                                        {section.name}
                                    </h2>
                                    <ul className="space-y-0.5">
                                        {section.fragments.map((f) => (
                                            <li key={f.id}>
                                                <a
                                                    href={`#${f.id}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        scrollToId(f.id);
                                                    }}
                                                    className={`block px-2 py-1.5 rounded-md text-sm transition-colors ${
                                                        activeId === f.id
                                                            ? "bg-blue-50 text-blue-700 font-medium"
                                                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                                                    }`}
                                                >
                                                    {f.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </nav>
                    )}
                </aside>

                {/* Content */}
                <div ref={contentRef} className="min-w-0 space-y-4">
                    {filtered.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-zinc-200 border-dashed">
                            <BookOpen className="w-10 h-10 mx-auto mb-3 text-zinc-300" />
                            <p className="text-zinc-500 font-medium">
                                No se encontró ayuda para &ldquo;{query}&rdquo;
                            </p>
                        </div>
                    ) : (
                        filtered.map((section) =>
                            section.fragments.map((f) => (
                                <section
                                    key={f.id}
                                    id={f.id}
                                    data-help-id={f.id}
                                    className="scroll-mt-20 bg-white rounded-xl border border-zinc-200 shadow-sm p-6"
                                >
                                    <div className="flex items-baseline justify-between gap-3 mb-3">
                                        <h2 className="text-xl font-bold text-zinc-900">
                                            {f.title}
                                        </h2>
                                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">
                                            {section.name}
                                        </span>
                                    </div>
                                    <div className="prose prose-sm prose-zinc max-w-none prose-headings:font-semibold prose-a:no-underline">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeSlug]}
                                            components={markdownComponents}
                                        >
                                            {resolveWikiLinks(f.body)}
                                        </ReactMarkdown>
                                    </div>
                                    {f.updatedAt && (
                                        <p className="text-xs text-zinc-400 mt-4 pt-3 border-t border-zinc-100">
                                            Actualizado: {f.updatedAt}
                                        </p>
                                    )}
                                </section>
                            )),
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
