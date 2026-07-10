"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    MessageCircle,
    X,
    Send,
    Plus,
    Loader2,
    LifeBuoy,
    FileText,
} from "lucide-react";

const STORAGE_KEY = "docs_chat_conversation_id";

type Citation = { fragment_id: string; title: string; url: string };

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
};

const markdownComponents = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
            href={href}
            target={href?.startsWith("#") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
        >
            {children}
        </a>
    ),
};

export function DocsChatWidget() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);

    const historyLoadedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Load the durable conversation once, the first time the panel is opened.
    useEffect(() => {
        if (!open || historyLoadedRef.current) return;
        historyLoadedRef.current = true;

        const id =
            typeof window !== "undefined"
                ? window.localStorage.getItem(STORAGE_KEY)
                : null;
        if (!id) return;

        (async () => {
            setConversationId(id);
            try {
                const res = await fetch("/api/docs-chat/history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversation_id: id }),
                });
                if (!res.ok) {
                    if (res.status === 404) {
                        window.localStorage.removeItem(STORAGE_KEY);
                        setConversationId(null);
                    }
                    return;
                }
                const data = await res.json();
                setMessages(
                    (data.messages ?? []).map(
                        (m: {
                            role: "user" | "assistant";
                            content: string;
                            retrieved_fragment_ids?: string[] | null;
                        }) => ({
                            role: m.role,
                            content: m.content,
                            citations:
                                m.role === "assistant"
                                    ? (m.retrieved_fragment_ids ?? []).map((fid) => ({
                                          fragment_id: fid,
                                          title: fid,
                                          url: `/ayuda#${fid}`,
                                      }))
                                    : undefined,
                        }),
                    ),
                );
            } catch {
                // Best-effort restore; a failed load just starts an empty panel.
            }
        })();
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [messages, loading]);

    async function send() {
        const text = input.trim();
        if (!text || loading) return;

        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setLoading(true);

        try {
            const res = await fetch("/api/docs-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    conversation_id: conversationId ?? undefined,
                }),
            });

            if (!res.ok) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content:
                            "Lo siento, ocurrió un error al consultar la ayuda. Intenta de nuevo.",
                    },
                ]);
                return;
            }

            const data = await res.json();
            if (data.conversation_id) {
                setConversationId(data.conversation_id);
                window.localStorage.setItem(STORAGE_KEY, data.conversation_id);
            }
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: data.answer,
                    citations: data.cited_fragments ?? [],
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "No se pudo conectar con la ayuda. Revisa tu conexión.",
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    function newConversation() {
        window.localStorage.removeItem(STORAGE_KEY);
        setConversationId(null);
        setMessages([]);
        setInput("");
        inputRef.current?.focus();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    // Hidden on public/unauthenticated pages: the proxy is auth-gated, so the
    // chat would 401 there anyway.
    if (
        pathname === "/login" ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/nerd-graph")
    )
        return null;

    return (
        <>
            {/* Floating bubble */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Abrir asistente de ayuda"
                    className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700"
                >
                    <MessageCircle className="h-6 w-6" />
                </button>
            )}

            {/* Panel */}
            {open && (
                <div className="fixed bottom-5 right-5 z-50 flex h-[560px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <LifeBuoy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                Asistente de ayuda
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={newConversation}
                                aria-label="Nueva conversación"
                                title="Nueva conversación"
                                className="rounded-md p-1.5 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Cerrar"
                                title="Cerrar"
                                className="rounded-md p-1.5 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div
                        ref={scrollRef}
                        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                    >
                        {messages.length === 0 && !loading && (
                            <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                                <p className="font-medium text-zinc-600 dark:text-zinc-400">
                                    ¿En qué te ayudo?
                                </p>
                                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                    Pregúntame sobre cómo usar el asistente de licitaciones.
                                </p>
                            </div>
                        )}

                        {messages.map((m, i) => (
                            <div
                                key={i}
                                className={
                                    m.role === "user" ? "flex justify-end" : "flex justify-start"
                                }
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                        m.role === "user"
                                            ? "bg-blue-600 text-white"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                                    }`}
                                >
                                    {m.role === "assistant" ? (
                                        <div className="prose prose-sm prose-zinc max-w-none break-words prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 dark:prose-invert">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={markdownComponents}
                                            >
                                                {m.content}
                                            </ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p className="whitespace-pre-wrap break-words">
                                            {m.content}
                                        </p>
                                    )}

                                    {m.role === "assistant" &&
                                        m.citations &&
                                        m.citations.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-200 dark:border-zinc-800 pt-2">
                                                {m.citations.map((c) => (
                                                    <a
                                                        key={c.fragment_id}
                                                        href={c.url}
                                                        className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-zinc-900 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-900 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950"
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        {c.title}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Pensando...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={onKeyDown}
                                rows={1}
                                placeholder="Escribe tu pregunta..."
                                className="max-h-28 flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            <button
                                type="button"
                                onClick={send}
                                disabled={loading || !input.trim()}
                                aria-label="Enviar"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
