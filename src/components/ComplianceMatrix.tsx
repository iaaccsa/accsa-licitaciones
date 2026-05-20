"use client";

import { useEffect, useState, useCallback } from "react";
import {
    ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
    MinusCircle, HelpCircle, ShieldAlert, Loader2, AlertCircle,
    FileText, Filter, Search, X, ShieldCheck, ClipboardEdit, Save,
    ChevronLeft, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ---- Types ----

type ComplianceVerdict =
    | "cumple" | "cumple_parcial" | "no_cumple"
    | "no_evidencia" | "no_aplica" | "requiere_verificacion_manual";

type Confidence = "alta" | "media" | "baja" | "muy_baja";

interface Citation {
    chunk_id: string;
    snippet: string;
    header: string | null;
    chunk_index: number;
    page_number: number | null;
    filename: string | null;
}

interface ComplianceEntry {
    id: string;
    analysis_id: string;
    requirement_id: string;
    proposal_id: string;
    verdict: ComplianceVerdict;
    confidence: string;
    reasoning: string | null;
    missing_elements: string[];
    citations: Citation[];
    manual_verification_required: boolean;
    extraction_batch_id: number;
    is_verified: boolean;
    reviewed_by: string | null;
    reviewed_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    analysis_slug: string;
    requirement_code: string;
    requirement_text: string;
    requirement_summary: string | null;
    requirement_roles: string[];
    requirement_mapped_factors: unknown | null;
    requirement_domain: string;
    requirement_weight: unknown | null;
    requirement_verification_method: string;
    requirement_temporal_scope: string;
    requirement_citations: unknown[];
    requirement_confidence: string;
    requirement_extraction_batch_id: number;
    requirement_is_verified: boolean;
    requirement_notes: string | null;
    requirement_created_at: string;
    requirement_updated_at: string;
    requirement_is_admissibility: boolean;
}

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
    roles: string[];
    verificationMethods: string[];
    isVerified: boolean | null;
    manualVerificationRequired: boolean | null;
    isAdmissibility: boolean | null;
}

// ---- Config ----

const VERDICT_CONFIG: Record<ComplianceVerdict, { label: string; color: string; icon: React.ReactNode }> = {
    cumple: {
        label: "Cumple",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    cumple_parcial: {
        label: "Cumple Parcial",
        color: "bg-amber-50 text-amber-700 border-amber-200",
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    no_cumple: {
        label: "No Cumple",
        color: "bg-red-50 text-red-700 border-red-200",
        icon: <XCircle className="w-3.5 h-3.5" />,
    },
    no_evidencia: {
        label: "Sin Evidencia",
        color: "bg-zinc-100 text-zinc-600 border-zinc-200",
        icon: <MinusCircle className="w-3.5 h-3.5" />,
    },
    no_aplica: {
        label: "No Aplica",
        color: "bg-slate-50 text-slate-600 border-slate-200",
        icon: <MinusCircle className="w-3.5 h-3.5" />,
    },
    requiere_verificacion_manual: {
        label: "Verificación Manual",
        color: "bg-orange-50 text-orange-700 border-orange-200",
        icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
};

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; color: string }> = {
    alta: { label: "Alta", color: "text-emerald-600" },
    media: { label: "Media", color: "text-amber-600" },
    baja: { label: "Baja", color: "text-orange-600" },
    muy_baja: { label: "Muy baja", color: "text-red-600" },
};

const ROLE_LABELS: Record<string, string> = {
    admisibilidad_obligatoria: "Adm. Obligatoria",
    admisibilidad_subsanable: "Adm. Subsanable",
    puntuable: "Puntuable",
    penalizador: "Penalizador",
    informativo: "Informativo",
    preferencia_legal: "Preferencia Legal",
    desconocido_pendiente_pliego_general: "Pendiente",
};

const VERIFICATION_METHOD_LABELS: Record<string, string> = {
    documento_adjunto: "Doc. Adjunto",
    declaracion_jurada: "Decl. Jurada",
    certificado_externo: "Cert. Externo",
    inspeccion: "Inspección",
    muestra: "Muestra",
    visita_tecnica: "Visita Técnica",
    auto_verificable_desde_oferta: "Auto-verificable",
    otro: "Otro",
};

const ALL_VERDICTS = Object.keys(VERDICT_CONFIG) as ComplianceVerdict[];
const ALL_ROLES = Object.keys(ROLE_LABELS);
const ALL_VERIFICATION_METHODS = Object.keys(VERIFICATION_METHOD_LABELS);

const LIMIT = 50;

// ---- Helpers ----

function VerdictBadge({ verdict }: { verdict: ComplianceVerdict }) {
    const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.no_evidencia;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

function ConfidenceLabel({ confidence }: { confidence: string }) {
    const cfg = CONFIDENCE_CONFIG[confidence as Confidence];
    if (!cfg) return <span className="text-xs text-zinc-400 font-mono">Confianza: {confidence}</span>;
    return <span className={`text-xs font-semibold ${cfg.color}`}>Confianza: {cfg.label}</span>;
}

function buildPageList(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (current > 3) pages.push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
    }
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
}

// ---- Main component ----

interface ComplianceMatrixProps {
    analysisId: string;
    proposalId: string;
}

export default function ComplianceMatrix({ analysisId, proposalId }: ComplianceMatrixProps) {
    const [entries, setEntries] = useState<ComplianceEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [lastPageConfirmed, setLastPageConfirmed] = useState(false);

    const [filters, setFilters] = useState<Filters>({
        verdicts: [],
        roles: [],
        verificationMethods: [],
        isVerified: null,
        manualVerificationRequired: null,
        isAdmissibility: null,
    });
    const [search, setSearch] = useState("");

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const buildParams = useCallback((offset: number) => {
        const p = new URLSearchParams();
        filters.roles.forEach((r) => p.append("role", r));
        filters.verificationMethods.forEach((vm) => p.append("verification_method", vm));
        if (filters.isAdmissibility !== null) {
            p.set("is_admissibility", String(filters.isAdmissibility));
        }
        p.set("order", "asc");
        p.set("limit", String(LIMIT));
        p.set("offset", String(offset));
        return p.toString();
    }, [filters.roles, filters.verificationMethods, filters.isAdmissibility]);

    const fetchPage = useCallback(async (page: number) => {
        setLoading(true);
        setError(null);
        try {
            const offset = (page - 1) * LIMIT;
            const qs = buildParams(offset);
            const res = await fetch(`/api/analyses/${analysisId}/proposals/${proposalId}/matrix?${qs}`);
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const data: ComplianceEntry[] = await res.json();
            setEntries(data);
            setCurrentPage(page);
            if (data.length < LIMIT) {
                setTotalPages(page);
                setLastPageConfirmed(true);
            } else {
                setTotalPages((prev) => Math.max(prev, page + 1));
            }
        } catch {
            setError("No se pudo cargar la matriz de cumplimiento.");
        } finally {
            setLoading(false);
        }
    }, [analysisId, proposalId, buildParams]);

    // Reset to page 1 when filters (server-side) change
    useEffect(() => {
        setCurrentPage(1);
        setTotalPages(1);
        setLastPageConfirmed(false);
        fetchPage(1);
    }, [fetchPage]);

    // Client-side filtering
    const visible = entries.filter((e) => {
        if (filters.verdicts.length > 0 && !filters.verdicts.includes(e.verdict)) return false;
        if (filters.isVerified !== null && e.is_verified !== filters.isVerified) return false;
        if (filters.manualVerificationRequired !== null && e.manual_verification_required !== filters.manualVerificationRequired) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            if (
                !e.requirement_code.toLowerCase().includes(q) &&
                !e.requirement_text.toLowerCase().includes(q) &&
                !(e.requirement_summary ?? "").toLowerCase().includes(q)
            ) return false;
        }
        return true;
    });

    function patchLocal(entryId: string, updated: Partial<ComplianceEntry>) {
        setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updated } : e)));
    }

    function startEdit(entry: ComplianceEntry) {
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
            const res = await fetch(`/api/compliance-matrix/${entryId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const updated: Partial<ComplianceEntry> = await res.json();
            patchLocal(entryId, updated);
            setEditingId(null);
            setDraft(null);
        } catch {
            setSaveError("Error al guardar. Intenta de nuevo.");
        } finally {
            setSaving(false);
        }
    }

    async function quickVerify(entry: ComplianceEntry) {
        try {
            const res = await fetch(`/api/compliance-matrix/${entry.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_verified: true, manual_verification_required: false }),
            });
            if (!res.ok) return;
            const updated: Partial<ComplianceEntry> = await res.json();
            patchLocal(entry.id, updated);
        } catch {
            // silent - user can retry via full edit
        }
    }

    // ---- Render ----

    const pageList = buildPageList(currentPage, totalPages);
    const canPrev = currentPage > 1;
    const canNext = !lastPageConfirmed || currentPage < totalPages;
    const canLast = lastPageConfirmed && currentPage < totalPages;

    return (
        <div className="space-y-4">
            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Buscar por código o texto del requisito..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 bg-zinc-50"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Verdict filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
                                    : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
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
                            className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* Role filter chips (server-side) */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-400 shrink-0">Rol:</span>
                    {ALL_ROLES.map((r) => {
                        const active = filters.roles.includes(r);
                        return (
                            <button
                                key={r}
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        roles: active
                                            ? f.roles.filter((x) => x !== r)
                                            : [...f.roles, r],
                                    }))
                                }
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active
                                    ? "bg-zinc-800 text-white border-zinc-800"
                                    : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
                                    }`}
                            >
                                {ROLE_LABELS[r]}
                            </button>
                        );
                    })}
                    {filters.roles.length > 0 && (
                        <button
                            onClick={() => setFilters((f) => ({ ...f, roles: [] }))}
                            className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* Verification method filter chips (server-side) */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-400 shrink-0">Método:</span>
                    {ALL_VERIFICATION_METHODS.map((vm) => {
                        const active = filters.verificationMethods.includes(vm);
                        return (
                            <button
                                key={vm}
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        verificationMethods: active
                                            ? f.verificationMethods.filter((x) => x !== vm)
                                            : [...f.verificationMethods, vm],
                                    }))
                                }
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active
                                    ? "bg-zinc-800 text-white border-zinc-800"
                                    : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
                                    }`}
                            >
                                {VERIFICATION_METHOD_LABELS[vm]}
                            </button>
                        );
                    })}
                    {filters.verificationMethods.length > 0 && (
                        <button
                            onClick={() => setFilters((f) => ({ ...f, verificationMethods: [] }))}
                            className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* isVerified / manualVerificationRequired toggles */}
                <div className="flex items-center gap-3 flex-wrap text-xs">
                    {(
                        [
                            { key: "isAdmissibility", trueLabel: "Excluyentes (Admisibilidad)", falseLabel: "No excluyentes (Otros)" },
                            { key: "isVerified", trueLabel: "Solo verificados", falseLabel: "Sin verificar" },
                            { key: "manualVerificationRequired", trueLabel: "Requieren revisión", falseLabel: "No requieren revisión" },
                        ] as const
                    ).map(({ key, trueLabel, falseLabel }) => {
                        const val = filters[key];
                        return (
                            <div key={key} className="flex items-center gap-1 border border-zinc-200 rounded-lg overflow-hidden">
                                {([null, true, false] as const).map((opt) => (
                                    <button
                                        key={String(opt)}
                                        onClick={() => setFilters((f) => ({ ...f, [key]: opt }))}
                                        className={`px-2.5 py-1 transition-colors ${val === opt
                                            ? "bg-zinc-800 text-white font-medium"
                                            : "text-zinc-500 hover:bg-zinc-50"
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
                <p className="text-sm text-zinc-500 px-1">
                    {visible.length} resultado{visible.length !== 1 ? "s" : ""}
                    {search ? ` para "${search}"` : ""}
                    {entries.length !== visible.length ? ` (de ${entries.length} en esta página)` : ""}
                </p>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Empty */}
            {!loading && !error && visible.length === 0 && (
                <div className="text-center py-16 text-zinc-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No hay entradas que coincidan con los filtros.</p>
                </div>
            )}

            {/* Entries */}
            {!loading && !error && visible.length > 0 && (
                <div className="space-y-2">
                    {visible.map((entry) => {
                        const isExpanded = expandedId === entry.id;
                        const isEditing = editingId === entry.id;

                        return (
                            <div
                                key={entry.id}
                                className={`bg-white rounded-xl border transition-all ${isExpanded ? "border-zinc-300 shadow-sm" : "border-zinc-200 hover:border-zinc-300"
                                    }`}
                            >
                                {/* Row header */}
                                <button
                                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                >
                                    <span className="text-zinc-400 shrink-0">
                                        {isExpanded
                                            ? <ChevronDown className="w-4 h-4" />
                                            : <ChevronRight className="w-4 h-4" />
                                        }
                                    </span>

                                    <span className="font-mono text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded shrink-0">
                                        {entry.requirement_code}
                                    </span>

                                    <span className="flex-1 text-sm text-zinc-700 truncate min-w-0">
                                        {entry.requirement_summary ?? entry.requirement_text.slice(0, 100)}
                                    </span>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {entry.is_verified && (
                                            <span title="Verificado">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                            </span>
                                        )}
                                        <ConfidenceLabel confidence={entry.confidence} />
                                        <VerdictBadge verdict={entry.verdict} />
                                    </div>
                                </button>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 pt-1 border-t border-zinc-100 space-y-4">
                                        {/* Requirement details */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge variant="outline" className="text-xs font-normal">
                                                    {entry.requirement_domain}
                                                </Badge>
                                                {entry.requirement_roles.map((r) => (
                                                    <Badge key={r} variant="secondary" className="text-xs font-normal">
                                                        {ROLE_LABELS[r] ?? r}
                                                    </Badge>
                                                ))}
                                                <span className="text-xs text-zinc-400">{entry.requirement_verification_method}</span>
                                                <span className="text-xs text-zinc-400">{entry.requirement_temporal_scope}</span>
                                            </div>
                                            <p className="text-sm text-zinc-800 bg-zinc-50 rounded-lg p-3 leading-relaxed">
                                                {entry.requirement_text}
                                            </p>
                                        </div>

                                        {/* Reasoning */}
                                        {entry.reasoning && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                                    Razonamiento
                                                </p>
                                                <p className="text-sm text-zinc-700 bg-blue-50 border border-blue-100 rounded-lg p-3 leading-relaxed">
                                                    {entry.reasoning}
                                                </p>
                                            </div>
                                        )}

                                        {/* Citations */}
                                        {entry.citations.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                                    Citas ({entry.citations.length})
                                                </p>
                                                <ul className="space-y-1.5">
                                                    {entry.citations.map((c, i) => (
                                                        <li key={i} className="text-sm text-zinc-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                                                            {(c.filename || c.page_number != null) && (
                                                                <span className="block text-xs text-zinc-500 mb-1">
                                                                    {c.filename ?? "Documento desconocido"}
                                                                    {c.page_number != null && ` — Página ${c.page_number}`}
                                                                </span>
                                                            )}
                                                            {c.header && (
                                                                <span className="block text-xs font-semibold text-zinc-500 mb-1">{c.header}</span>
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
                                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                                    Elementos faltantes
                                                </p>
                                                <ul className="space-y-1">
                                                    {entry.missing_elements.map((m, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                                                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
                                                            {m}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {entry.notes && !isEditing && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                                                    Notas
                                                </p>
                                                <p className="text-sm text-zinc-700 bg-zinc-50 rounded-lg p-3">{entry.notes}</p>
                                            </div>
                                        )}

                                        {/* Review info */}
                                        {(entry.reviewed_by || entry.reviewed_at) && !isEditing && (
                                            <p className="text-xs text-zinc-400">
                                                Revisado
                                                {entry.reviewed_by ? ` por ${entry.reviewed_by}` : ""}
                                                {entry.reviewed_at
                                                    ? ` el ${new Date(entry.reviewed_at).toLocaleDateString("es-ES")}`
                                                    : ""}
                                            </p>
                                        )}

                                        {/* HITL form */}
                                        {isEditing && draft ? (
                                            <div className="border border-zinc-200 rounded-xl p-4 space-y-4 bg-zinc-50">
                                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                                    <ClipboardEdit className="w-3.5 h-3.5" />
                                                    Edición manual
                                                </p>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-zinc-600 mb-1">Veredicto</label>
                                                        <select
                                                            value={draft.verdict ?? ""}
                                                            onChange={(e) => setDraft((d) => d && { ...d, verdict: e.target.value as ComplianceVerdict })}
                                                            className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300"
                                                        >
                                                            {ALL_VERDICTS.map((v) => (
                                                                <option key={v} value={v}>{VERDICT_CONFIG[v].label}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-medium text-zinc-600 mb-1">Confianza</label>
                                                        <select
                                                            value={draft.confidence ?? ""}
                                                            onChange={(e) => setDraft((d) => d && { ...d, confidence: e.target.value as Confidence })}
                                                            className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300"
                                                        >
                                                            {(["alta", "media", "baja", "muy_baja"] as const).map((c) => (
                                                                <option key={c} value={c}>{CONFIDENCE_CONFIG[c].label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 mb-1">Razonamiento</label>
                                                    <textarea
                                                        value={draft.reasoning}
                                                        onChange={(e) => setDraft((d) => d && { ...d, reasoning: e.target.value })}
                                                        rows={3}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 mb-1">Notas internas</label>
                                                    <textarea
                                                        value={draft.notes}
                                                        onChange={(e) => setDraft((d) => d && { ...d, notes: e.target.value })}
                                                        rows={2}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-600 mb-1">Revisado por</label>
                                                    <input
                                                        type="text"
                                                        value={draft.reviewed_by}
                                                        onChange={(e) => setDraft((d) => d && { ...d, reviewed_by: e.target.value })}
                                                        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300"
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
                                                        <span className="text-sm text-zinc-700">Verificado</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.manual_verification_required}
                                                            onChange={(e) => setDraft((d) => d && { ...d, manual_verification_required: e.target.checked })}
                                                            className="w-4 h-4 rounded"
                                                        />
                                                        <span className="text-sm text-zinc-700">Requiere revisión manual</span>
                                                    </label>
                                                </div>

                                                {saveError && (
                                                    <p className="text-xs text-red-600 flex items-center gap-1">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        {saveError}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => saveEdit(entry.id)}
                                                        disabled={saving}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                        Guardar
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingId(null); setDraft(null); setSaveError(null); }}
                                                        disabled={saving}
                                                        className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
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
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                                    >
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        Verificar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => startEdit(entry)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                                                >
                                                    <ClipboardEdit className="w-3.5 h-3.5" />
                                                    Editar
                                                </button>
                                                {entry.manual_verification_required && !entry.is_verified && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                                                        <HelpCircle className="w-3.5 h-3.5" />
                                                        Pendiente de revisión manual
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && !error && totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-2">
                    {/* Primera */}
                    <button
                        onClick={() => fetchPage(1)}
                        disabled={!canPrev}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Primera página"
                    >
                        <ChevronsLeft className="w-4 h-4" />
                    </button>

                    {/* Anterior */}
                    <button
                        onClick={() => fetchPage(currentPage - 1)}
                        disabled={!canPrev}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Página anterior"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Números de página */}
                    {pageList.map((item, i) =>
                        item === "..." ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-sm text-zinc-400 select-none">...</span>
                        ) : (
                            <button
                                key={item}
                                onClick={() => item !== currentPage && fetchPage(item)}
                                className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${item === currentPage
                                    ? "bg-zinc-900 text-white"
                                    : "text-zinc-600 hover:bg-zinc-100"
                                    }`}
                            >
                                {item}
                            </button>
                        )
                    )}

                    {/* Siguiente */}
                    <button
                        onClick={() => fetchPage(currentPage + 1)}
                        disabled={!canNext}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Página siguiente"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Última */}
                    <button
                        onClick={() => fetchPage(totalPages)}
                        disabled={!canLast}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="Última página"
                    >
                        <ChevronsRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
