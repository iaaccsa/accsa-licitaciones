"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MessageSquare, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function FileChatPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const fileId = params.fileId as string;

    const [slug, setSlug] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchAnalysisAndHistory = async () => {
            const [analysisRes, filesRes, historyRes] = await Promise.all([
                fetch(`/api/analyses/${id}`),
                fetch(`/api/analyses/${id}/files`, { method: "POST" }),
                fetch("/api/chat/history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_id: fileId, limit: 20 }),
                }),
            ]);

            if (analysisRes.ok) {
                const data = await analysisRes.json();
                setSlug(data.slug ?? null);
            }

            if (filesRes.ok) {
                const data = await filesRes.json();
                const file = Array.isArray(data) ? data.find((f: { id: string; file_name: string }) => f.id === fileId) : null;
                setFileName(file?.file_name ?? null);
            }

            if (historyRes.ok) {
                const data = await historyRes.json();
                if (Array.isArray(data.messages) && data.messages.length > 0) {
                    setMessages(data.messages);
                }
            }

            setIsLoadingHistory(false);
        };

        if (id && fileId) fetchAnalysisAndHistory();
    }, [id, fileId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading || !slug) return;

        const userMessage: Message = { role: "user", content: trimmed };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    analysis_slug: slug,
                    file_id: fileId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || data.error || "Error al comunicarse con el servidor");
            }

            setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const canSend = input.trim().length > 0 && !isLoading && !isLoadingHistory && !!slug;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6 h-[calc(100vh-2rem)]">
            {/* Header */}
            <div className="flex items-center gap-4 flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                    <ChevronLeft className="w-5 h-5 text-zinc-600" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-violet-600" />
                        Chat del documento
                    </h1>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        {slug && (
                            <>
                                <span className="font-mono bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 uppercase">{slug}</span>
                                <span className="text-zinc-300">|</span>
                            </>
                        )}
                        {fileName && <span className="text-zinc-500 truncate">{fileName}</span>}
                    </div>
                </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-zinc-200 shadow-sm p-4 flex flex-col gap-3 min-h-0">
                {isLoadingHistory ? (
                    <div className="flex-1 flex flex-col gap-3 justify-end">
                        <div className="flex justify-start"><div className="h-8 w-64 bg-zinc-100 rounded-xl animate-pulse" /></div>
                        <div className="flex justify-end"><div className="h-8 w-48 bg-violet-100 rounded-xl animate-pulse" /></div>
                        <div className="flex justify-start"><div className="h-16 w-72 bg-zinc-100 rounded-xl animate-pulse" /></div>
                    </div>
                ) : messages.length === 0 && !isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm italic">
                        Hacé una pregunta sobre el documento para comenzar.
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                                    msg.role === "user"
                                        ? "bg-violet-600 text-white whitespace-pre-wrap"
                                        : "bg-zinc-100 text-zinc-800 border border-zinc-200 prose prose-sm prose-zinc max-w-none"
                                }`}
                            >
                                {msg.role === "user" ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-zinc-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Pensando...
                        </div>
                    </div>
                )}
                {error && (
                    <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="flex items-end gap-2 flex-shrink-0">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoadingHistory ? "Cargando historial..." : slug ? "Escribí tu pregunta..." : "Cargando análisis..."}
                    disabled={!slug || isLoadingHistory}
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="p-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm"
                    title="Enviar"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
