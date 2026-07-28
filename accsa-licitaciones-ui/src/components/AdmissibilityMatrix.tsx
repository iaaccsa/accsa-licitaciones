"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import {
    ChevronDown, CheckCircle2, XCircle,
    HelpCircle, Loader2, AlertCircle,
    FileText, Filter, Search, X, ShieldCheck, ClipboardEdit, Save,
} from "lucide-react";
import { Pagination } from "@/components/Pagination";
import type { AdmissibilityResult, ComplianceVerdict, Confidence } from "@/lib/admissibility-types";
import { isExclusionary } from "@/lib/admissibility-types";

// ---- Config ----

// Admissibility verdicts are binary (Feature 08): cumple / no_cumple only.
const VERDICT_CONFIG: Record<ComplianceVerdict, { label: string; color: string; icon: React.ReactNode }> = {
    cumple: {
        label: "Cumple",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    no_cumple: {
        label: "No Cumple",
        color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
        icon: <XCircle className="w-3.5 h-3.5" />,
    },
};

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; color: string }> = {
    alta: { label: "Alta", color: "text-emerald-600 dark:text-emerald-400" },
    media: { label: "Media", color: "text-amber-600 dark:text-amber-400" },
    baja: { label: "Baja", color: "text-orange-600 dark:text-orange-400" },
    muy_baja: { label: "Muy baja", color: "text-red-600 dark:text-red-400" },
};

const ROLE_LABELS: Record<string, string> = {
    admisibilidad_obligatoria: "Admisibilidad obligatoria",
    admisibilidad_subsanable: "Admisibilidad subsanable",
};

const ROLE_COLORS: Record<string, string> = {
    admisibilidad_obligatoria: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-100 dark:border-red-900",
    admisibilidad_subsanable: "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-900",
};

const DOMAIN_LABELS: Record<string, string> = {
    technical: "Técnico", administrative: "Administrativo", legal: "Legal",
    financial: "Económico / Financiero", hr: "Recursos Humanos", logistics: "Logístico",
    environmental: "Ambiental", quality: "Calidad", safety: "Seguridad", other: "Otro",
};

const VERIFICATION_LABELS: Record<string, string> = {
    attached_document: "Documento adjunto", sworn_statement: "Declaración jurada",
    external_certificate: "Certificado externo", inspection: "Inspección",
    sample: "Muestra", site_visit: "Visita técnica",
    auto_verifiable_from_offer: "Auto-verificable desde la oferta", other: "Otro",
};

const SCOPE_LABELS: Record<string, string> = {
    at_bid_time: "Al momento de ofertar", pre_award: "Previo a la adjudicación",
    during_execution: "Durante la ejecución", post_sale: "Postventa", other: "Otro",
};

const ALL_VERDICTS = Object.keys(VERDICT_CONFIG) as ComplianceVerdict[];

const LIMIT = 500;
const PAGE_SIZE = 10;

interface EditDraft {
    verdict: ComplianceVerdict | null;
    confidence: Confidence | null;
    reasoning: string;
    notes: string;
    reviewed_by: string;
    is_verified: boolean;
    manual_verification_required: boolean;
}

interface Filters {
    verdicts: ComplianceVerdict[];
    isVerified: boolean | null;
    manualVerificationRequired: boolean | null;
}

// ---- Helpers ----

function VerdictBadge({ verdict }: { verdict: ComplianceVerdict }) {
    const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.no_cumple;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

function ConfidenceLabel({ confidence }: { confidence: string }) {
    const cfg = CONFIDENCE_CONFIG[confidence as Confidence];
    if (!cfg) return <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">Confianza: {confidence}</span>;
    return <span className={`text-xs font-semibold ${cfg.color}`}>Confianza: {cfg.label}</span>;
}

// ---- Main component ----

interface AdmissibilityMatrixProps {
    analysisId: string;
    proposalId: string;
}

export default function AdmissibilityMatrix({ analysisId, proposalId }: AdmissibilityMatrixProps) {

    const [filters, setFilters] = useState<Filters>({
        verdicts: [],
        isVerified: null,
        manualVerificationRequired: null,
    });
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const listParams = new URLSearchParams();
    listParams.set("limit", String(LIMIT));
    listParams.set("offset", "0");
    const { data, isLoading: loading, error: swrError, mutate } = useSWR<AdmissibilityResult[]>(
        `/api/analyses/${analysisId}/proposals/${proposalId}/admissibility-results?${listParams.toString()}`,
        fetcher,
        { revalidateOnFocus: false },
    );
    const entries = Array.isArray(data) ? data : [];
    const error = swrError ? "No se pudo cargar la matriz de admisibilidad." : null;

    // Client-side filtering
    const visible = entries.filter((e) => {
        if (filters.verdicts.length > 0 && !filters.verdicts.includes(e.verdict)) return false;
        if (filters.isVerified !== null && e.is_verified !== filters.isVerified) return false;
        if (filters.manualVerificationRequired !== null && e.manual_verification_required !== filters.manualVerificationRequired) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            if (
                !e.requirement.requirement_code.toLowerCase().includes(q) &&
                !e.requirement.requirement_text.toLowerCase().includes(q) &&
                !(e.requirement.requirement_summary ?? "").toLowerCase().includes(q)
            ) return false;
        }
        return true;
    });

    // Reset to first page when filters or search change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPage(1);
    }, [filters, search]);

    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageItems = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const goToPage = (p: number) => {
        setPage(p);
        window.scrollTo({ top: 0 });
    };

    function patchLocal(entryId: string, updated: Partial<AdmissibilityResult>) {
        mutate(
            (prev) => (prev ?? []).map((e) => (e.id === entryId ? { ...e, ...updated } : e)),
            { revalidate: false },
        );
    }

    function startEdit(entry: AdmissibilityResult) {
        setEditingId(entry.id);
        setSaveError(null);
        setDraft({
            verdict: entry.verdict,
            confidence: (entry.confidence as Confidence) ?? null,
            reasoning: entry.reasoning ?? "",
            notes: entry.notes ?? "",
            reviewed_by: entry.reviewed_by ?? "",
            is_verified: entry.is_verified,
            manual_verification_required: entry.manual_verification_required,
        });
    }

    async function saveEdit(entryId: string) {
        if (!draft) return;
        setSaving(true);
        setSaveError(null);
        try {
            const body: Record<string, unknown> = {
                verdict: draft.verdict,
                confidence: draft.confidence,
                reasoning: draft.reasoning || null,
                notes: draft.notes || null,
                reviewed_by: draft.reviewed_by || null,
                is_verified: draft.is_verified,
                manual_verification_required: draft.manual_verification_required,
            };
            const res = await fetch(`/api/admissibility-results/${entryId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const updated: Partial<AdmissibilityResult> = await res.json();
            patchLocal(entryId, updated);
            setEditingId(null);
            setDraft(null);
        } catch {
            setSaveError("Error al guardar. Intenta de nuevo.");
        } finally {
            setSaving(false);
        }
    }

    async function quickVerify(entry: AdmissibilityResult) {
        try {
            const res = await fetch(`/api/admissibility-results/${entry.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_verified: true, manual_verification_required: false }),
            });
            if (!res.ok) return;
            const updated: Partial<AdmissibilityResult> = await res.json();
            patchLocal(entry.id, updated);
        } catch {
            // silent - user can retry via full edit
        }
    }

    // ---- Render ----

    return (
        <div className="space-y-4">
            {/* Filter bar */}
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/30 p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Buscar por código o texto del requisito..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 bg-white dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-600"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Verdict filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                    {ALL_VERDICTS.map((v) => {
                        const cfg = VERDICT_CONFIG[v];
                        const active = filters.verdicts.includes(v);
                        return (
                            <button
                                key={v}
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        verdicts: active
                                            ? f.verdicts.filter((x) => x !== v)
                                            : [...f.verdicts, v],
                                    }))
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active
                                    ? cfg.color
                                    : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                                    }`}
                            >
                                {cfg.icon}
                                {cfg.label}
                            </button>
                        );
                    })}
                    {filters.verdicts.length > 0 && (
                        <button
                            onClick={() => setFilters((f) => ({ ...f, verdicts: [] }))}
                            className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* isVerified / manualVerificationRequired toggles */}
                <div className="flex items-center gap-3 flex-wrap text-xs">
                    {(
                        [
                            { key: "isVerified", trueLabel: "Solo verificados", falseLabel: "Sin verificar" },
                            { key: "manualVerificationRequired", trueLabel: "Requieren revisión", falseLabel: "No requieren revisión" },
                        ] as const
                    ).map(({ key, trueLabel, falseLabel }) => {
                        const val = filters[key];
                        return (
                            <div key={key} className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                                {([null, true, false] as const).map((opt) => (
                                    <button
                                        key={String(opt)}
                                        onClick={() => setFilters((f) => ({ ...f, [key]: opt }))}
                                        className={`px-2.5 py-1 transition-colors ${val === opt
                                            ? "bg-zinc-800 text-white font-medium"
                                            : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                            }`}
                                    >
                                        {opt === null ? "Todos" : opt ? trueLabel : falseLabel}
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Count */}
            {!loading && !error && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 px-1">
                    {visible.length} resultado{visible.length !== 1 ? "s" : ""}
                    {search ? ` para "${search}"` : ""}
                    {entries.length !== visible.length ? ` (de ${entries.length})` : ""}
                </p>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 dark:text-zinc-500" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 py-8 justify-center">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Empty */}
            {!loading && !error && visible.length === 0 && (
                <div className="text-center py-16 text-zinc-400 dark:text-zinc-500">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No hay requisitos de admisibilidad evaluados para esta propuesta.</p>
                </div>
            )}

            {/* Entries */}
            {!loading && !error && visible.length > 0 && (
                <div className="space-y-4">
                    {pageItems.map((entry) => {
                        const isExpanded = expandedId === entry.id;
                        const isEditing = editingId === entry.id;
                        const req = entry.requirement;

                        return (
                            <div
                                key={entry.id}
                                className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all duration-200"
                            >
                                {/* Header: code + text + expand toggle */}
                                <div
                                    className="flex items-start gap-3 md:gap-6 cursor-pointer select-none pb-4 border-b border-zinc-200 dark:border-zinc-800"
                                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                >
                                    <span className="min-w-[80px] md:min-w-[100px] shrink-0 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                        {req.requirement_code}
                                    </span>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed">
                                            {req.requirement_text}
                                        </p>
                                        {req.requirement_summary && (
                                            <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1 leading-relaxed">
                                                {req.requirement_summary}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="pt-4 space-y-4">
                                        {/* Requirement tags */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {req.roles.map((r) => (
                                                <span
                                                    key={r}
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[r] ?? "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"}`}
                                                >
                                                    Rol: {ROLE_LABELS[r] ?? r}
                                                </span>
                                            ))}
                                            {isExclusionary(req.roles) && (
                                                <span
                                                    title="El incumplimiento de este requisito rechaza la propuesta"
                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900"
                                                >
                                                    Excluyente
                                                </span>
                                            )}
                                            {req.domain && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
                                                    Dominio: {DOMAIN_LABELS[req.domain] ?? req.domain}
                                                </span>
                                            )}
                                            {req.temporal_scope && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                                                    Alcance: {SCOPE_LABELS[req.temporal_scope] ?? req.temporal_scope}
                                                </span>
                                            )}
                                            {req.verification_method && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                                                    Verificación: {VERIFICATION_LABELS[req.verification_method] ?? req.verification_method}
                                                </span>
                                            )}
                                        </div>

                                        {/* Reasoning */}
                                        {entry.reasoning && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                                                    Razonamiento
                                                </p>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-lg p-3 leading-relaxed">
                                                    {entry.reasoning}
                                                </p>
                                            </div>
                                        )}

                                        {/* Citations */}
                                        {entry.citations.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                                                    Citas ({entry.citations.length})
                                                </p>
                                                <ul className="space-y-1.5">
                                                    {entry.citations.map((c, i) => (
                                                        <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-900 rounded-lg p-2.5">
                                                            {(c.filename || c.page_number != null) && (
                                                                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                                                    {c.filename ?? "Documento desconocido"}
                                                                    {c.page_number != null && ` — Página ${c.page_number}`}
                                                                </span>
                                                            )}
                                                            {c.header && (
                                                                <span className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">{c.header}</span>
                                                            )}
                                                            <span className="italic">&ldquo;{c.snippet}&rdquo;</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Missing elements */}
                                        {entry.missing_elements.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                                                    Elementos faltantes
                                                </p>
                                                <ul className="space-y-1">
                                                    {entry.missing_elements.map((m, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                                                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400 dark:text-red-500" />
                                                            {m}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {entry.notes && !isEditing && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                                                    Notas
                                                </p>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">{entry.notes}</p>
                                            </div>
                                        )}

                                        {/* Review info */}
                                        {(entry.reviewed_by || entry.reviewed_at) && !isEditing && (
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                                Revisado
                                                {entry.reviewed_by ? ` por ${entry.reviewed_by}` : ""}
                                                {entry.reviewed_at
                                                    ? ` el ${new Date(entry.reviewed_at).toLocaleDateString("es-ES")}`
                                                    : ""}
                                            </p>
                                        )}

                                        {/* HITL form */}
                                        {isEditing && draft ? (
                                            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-4 bg-zinc-50 dark:bg-zinc-800/50">
                                                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <ClipboardEdit className="w-3.5 h-3.5" />
                                                    Edición manual
                                                </p>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Veredicto</label>
                                                        <select
                                                            value={draft.verdict ?? ""}
                                                            onChange={(e) => setDraft((d) => d && { ...d, verdict: e.target.value as ComplianceVerdict })}
                                                            className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600"
                                                        >
                                                            {ALL_VERDICTS.map((v) => (
                                                                <option key={v} value={v}>{VERDICT_CONFIG[v].label}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Confianza</label>
                                                        <select
                                                            value={draft.confidence ?? ""}
                                                            onChange={(e) => setDraft((d) => d && { ...d, confidence: e.target.value as Confidence })}
                                                            className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600"
                                                        >
                                                            {(["alta", "media", "baja", "muy_baja"] as const).map((c) => (
                                                                <option key={c} value={c}>{CONFIDENCE_CONFIG[c].label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Razonamiento</label>
                                                    <textarea
                                                        value={draft.reasoning}
                                                        onChange={(e) => setDraft((d) => d && { ...d, reasoning: e.target.value })}
                                                        rows={3}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Notas internas</label>
                                                    <textarea
                                                        value={draft.notes}
                                                        onChange={(e) => setDraft((d) => d && { ...d, notes: e.target.value })}
                                                        rows={2}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Revisado por</label>
                                                    <input
                                                        type="text"
                                                        value={draft.reviewed_by}
                                                        onChange={(e) => setDraft((d) => d && { ...d, reviewed_by: e.target.value })}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600"
                                                        placeholder="Nombre del revisor"
                                                    />
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.is_verified}
                                                            onChange={(e) => setDraft((d) => d && { ...d, is_verified: e.target.checked })}
                                                            className="w-4 h-4 rounded"
                                                        />
                                                        <span className="text-sm text-zinc-700 dark:text-zinc-300">Verificado</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.manual_verification_required}
                                                            onChange={(e) => setDraft((d) => d && { ...d, manual_verification_required: e.target.checked })}
                                                            className="w-4 h-4 rounded"
                                                        />
                                                        <span className="text-sm text-zinc-700 dark:text-zinc-300">Requiere revisión manual</span>
                                                    </label>
                                                </div>

                                                {saveError && (
                                                    <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        {saveError}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => saveEdit(entry.id)}
                                                        disabled={saving}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-700 text-white text-sm font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                        Guardar
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingId(null); setDraft(null); setSaveError(null); }}
                                                        disabled={saving}
                                                        className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 pt-1">
                                                {!entry.is_verified && (
                                                    <button
                                                        onClick={() => quickVerify(entry)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors"
                                                    >
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        Verificar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => startEdit(entry)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                                >
                                                    <ClipboardEdit className="w-3.5 h-3.5" />
                                                    Editar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Footer: review status + verdict */}
                                <div className="flex items-center justify-between gap-4 mt-4">
                                    <div className="flex items-center gap-3">
                                        {entry.is_verified && (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                Verificado
                                            </span>
                                        )}
                                        {entry.manual_verification_required && !entry.is_verified && (
                                            <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                                                <HelpCircle className="w-3.5 h-3.5" />
                                                Pendiente de revisión manual
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ConfidenceLabel confidence={entry.confidence} />
                                        <VerdictBadge verdict={entry.verdict} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <Pagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
                </div>
            )}
        </div>
    );
}
