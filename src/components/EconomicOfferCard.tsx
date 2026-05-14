"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Coins, AlertTriangle, FileQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Confidence = "alta" | "media" | "baja" | "muy_baja";

interface EconomicCitation {
    chunk_id: string;
    snippet: string;
    header?: string | null;
    chunk_index?: number | null;
}

interface EconomicLineItem {
    code?: string | null;
    description: string;
    quantity?: number | null;
    unit_price?: number | string | null;
    subtotal?: number | string | null;
    currency?: string | null;
}

interface EconomicOffer {
    id: string;
    analysis_id: string;
    proposal_id: string;
    total_amount: number | string | null;
    currency: string | null;
    includes_taxes: boolean | null;
    tax_details: Record<string, unknown> | null;
    payment_terms: string | null;
    validity_days: number | null;
    adjustment_formula: string | null;
    line_items: EconomicLineItem[];
    citations: EconomicCitation[];
    confidence: Confidence;
    reasoning: string | null;
    requires_manual_review: boolean;
    extracted_by: string | null;
    notes: string | null;
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; color: string }> = {
    alta: { label: "Confianza alta", color: "bg-emerald-50 text-emerald-700" },
    media: { label: "Confianza media", color: "bg-blue-50 text-blue-700" },
    baja: { label: "Confianza baja", color: "bg-amber-50 text-amber-700" },
    muy_baja: { label: "Confianza muy baja", color: "bg-red-50 text-red-700" },
};

function formatAmount(value: number | string | null | undefined, currency?: string | null): string {
    if (value == null || value === "") return "—";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "—";
    const formatted = new Intl.NumberFormat("es-UY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
    return currency ? `${currency} ${formatted}` : formatted;
}

export default function EconomicOfferCard({
    analysisId,
    proposalId,
}: {
    analysisId: string;
    proposalId: string;
}) {
    const [offer, setOffer] = useState<EconomicOffer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCitations, setShowCitations] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/analyses/${analysisId}/proposals/${proposalId}/economic`);
                if (!res.ok) throw new Error(`Error ${res.status}`);
                const data = await res.json();
                setOffer(data);
            } catch {
                setError("No se pudo cargar la oferta económica.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [analysisId, proposalId]);

    if (isLoading) {
        return (
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-600" />
                        Propuesta Económica
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <Skeleton className="h-10 w-48" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-600" />
                        Propuesta Económica
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-red-600">{error}</p>
                </CardContent>
            </Card>
        );
    }

    if (!offer) {
        return (
            <Card className="min-w-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-600" />
                        Propuesta Económica
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                        <FileQuestion className="w-4 h-4" />
                        Sin datos económicos extraídos para esta propuesta.
                    </div>
                </CardContent>
            </Card>
        );
    }

    const confidenceCfg = CONFIDENCE_CONFIG[offer.confidence] ?? CONFIDENCE_CONFIG.media;

    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-600" />
                        Propuesta Económica
                    </span>
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${confidenceCfg.color}`}>
                            {confidenceCfg.label}
                        </span>
                        {offer.requires_manual_review && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Requiere revisión manual
                            </span>
                        )}
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {/* Total destacado */}
                    <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total</span>
                        <span className="text-3xl font-bold text-zinc-900 tabular-nums">
                            {formatAmount(offer.total_amount, offer.currency)}
                        </span>
                        {offer.includes_taxes != null && (
                            <span className="text-xs text-zinc-500">
                                {offer.includes_taxes ? "IVA incluido" : "IVA no incluido"}
                            </span>
                        )}
                    </div>

                    {/* Metadata grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        {offer.payment_terms && (
                            <Field label="Plazo de pago" value={offer.payment_terms} />
                        )}
                        {offer.validity_days != null && (
                            <Field label="Validez de oferta" value={`${offer.validity_days} días`} />
                        )}
                        {offer.adjustment_formula && (
                            <Field label="Fórmula de ajuste" value={offer.adjustment_formula} multiline />
                        )}
                        {offer.tax_details && Object.keys(offer.tax_details).length > 0 && (
                            <Field
                                label="Detalle de impuestos"
                                value={
                                    <pre className="text-xs font-mono text-zinc-700 bg-zinc-50 border border-zinc-100 rounded p-2 whitespace-pre-wrap break-all">
                                        {JSON.stringify(offer.tax_details, null, 2)}
                                    </pre>
                                }
                            />
                        )}
                    </div>

                    {/* Line items */}
                    {offer.line_items.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                                Detalle por ítems ({offer.line_items.length})
                            </h4>
                            <div className="overflow-x-auto rounded-lg border border-zinc-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-50">
                                        <tr className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                            <th className="px-3 py-2">Código</th>
                                            <th className="px-3 py-2">Descripción</th>
                                            <th className="px-3 py-2 text-right">Cant.</th>
                                            <th className="px-3 py-2 text-right">P. Unit.</th>
                                            <th className="px-3 py-2 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                        {offer.line_items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-3 py-2 font-mono text-xs text-zinc-600">{item.code || "—"}</td>
                                                <td className="px-3 py-2 text-zinc-800">{item.description}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                                                    {item.quantity ?? "—"}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                                                    {formatAmount(item.unit_price, item.currency || offer.currency)}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900">
                                                    {formatAmount(item.subtotal, item.currency || offer.currency)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Citations colapsable */}
                    {offer.citations.length > 0 && (
                        <div className="border-t border-zinc-100 pt-4">
                            <button
                                type="button"
                                onClick={() => setShowCitations((v) => !v)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 transition-colors"
                            >
                                {showCitations ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                Citas en el documento ({offer.citations.length})
                            </button>
                            {showCitations && (
                                <ul className="mt-3 space-y-3">
                                    {offer.citations.map((c, idx) => (
                                        <li key={idx} className="text-xs border-l-2 border-emerald-200 pl-3">
                                            {c.header && (
                                                <p className="font-semibold text-zinc-700 mb-1">{c.header}</p>
                                            )}
                                            <p className="text-zinc-600 italic leading-relaxed whitespace-pre-wrap">
                                                {c.snippet}
                                            </p>
                                            <span className="inline-block mt-1 font-mono text-[10px] text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">
                                                {c.chunk_id}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* Reasoning + notes pie */}
                    {(offer.reasoning || offer.notes) && (
                        <div className="border-t border-zinc-100 pt-4 space-y-2 text-xs text-zinc-500">
                            {offer.reasoning && (
                                <p>
                                    <span className="font-semibold text-zinc-600">Razonamiento: </span>
                                    {offer.reasoning}
                                </p>
                            )}
                            {offer.notes && (
                                <p>
                                    <span className="font-semibold text-zinc-600">Notas: </span>
                                    {offer.notes}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function Field({ label, value, multiline = false }: { label: string; value: React.ReactNode; multiline?: boolean }) {
    return (
        <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
            {typeof value === "string" ? (
                <p className={`text-zinc-800 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p>
            ) : (
                value
            )}
        </div>
    );
}

export { formatAmount };
export type { EconomicOffer };
