"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, AlertTriangle, FileQuestion, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, type EconomicOffer } from "@/components/EconomicOfferCard";

interface Proposal {
    id: string;
    label: string;
    provider_name: string | null;
}

export default function EconomicComparisonTable({ analysisId }: { analysisId: string }) {
    const [offers, setOffers] = useState<EconomicOffer[]>([]);
    const [proposals, setProposals] = useState<Record<string, Proposal>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [offersRes, proposalsRes] = await Promise.all([
                    fetch(`/api/analyses/${analysisId}/economic-offers`),
                    fetch(`/api/analyses/${analysisId}/proposals`),
                ]);
                if (!offersRes.ok) throw new Error(`offers ${offersRes.status}`);
                if (!proposalsRes.ok) throw new Error(`proposals ${proposalsRes.status}`);
                const offersData = (await offersRes.json()) as EconomicOffer[];
                const proposalsData = (await proposalsRes.json()) as Proposal[];
                setOffers(Array.isArray(offersData) ? offersData : []);
                setProposals(
                    (Array.isArray(proposalsData) ? proposalsData : []).reduce(
                        (acc, p) => ({ ...acc, [p.id]: p }),
                        {} as Record<string, Proposal>,
                    ),
                );
            } catch {
                setError("No se pudo cargar la comparativa económica.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [analysisId]);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        Comparativa de Ofertas Económicas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-6 text-zinc-400 dark:text-zinc-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return null;
    }

    if (offers.length === 0) {
        return null;
    }

    const sorted = [...offers].sort((a, b) => {
        const aNum = a.total_amount == null ? Infinity : Number(a.total_amount);
        const bNum = b.total_amount == null ? Infinity : Number(b.total_amount);
        return aNum - bNum;
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Comparativa de Ofertas Económicas
                    <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-2">
                        ({offers.length} {offers.length === 1 ? "propuesta" : "propuestas"})
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                            <tr className="text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                <th className="px-3 py-2">Propuesta</th>
                                <th className="px-3 py-2">Proveedor</th>
                                <th className="px-3 py-2 text-right">Total</th>
                                <th className="px-3 py-2 text-center">IVA</th>
                                <th className="px-3 py-2">Plazo pago</th>
                                <th className="px-3 py-2 text-right">Validez</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {sorted.map((offer, idx) => {
                                const p = proposals[offer.proposal_id];
                                const isLowest = idx === 0 && offer.total_amount != null;
                                return (
                                    <tr key={offer.id} className={isLowest ? "bg-emerald-50/40 dark:bg-emerald-950/40" : ""}>
                                        <td className="px-3 py-2">
                                            <Link
                                                href={`/analyses/${analysisId}/proposals/${offer.proposal_id}`}
                                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                            >
                                                {p?.label || offer.proposal_id.slice(0, 8)}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{p?.provider_name || "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                                            {formatAmount(offer.total_amount, offer.currency)}
                                            {isLowest && (
                                                <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Menor</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center text-xs text-zinc-600 dark:text-zinc-400">
                                            {offer.includes_taxes == null ? "—" : offer.includes_taxes ? "Sí" : "No"}
                                        </td>
                                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 text-xs truncate max-w-[180px]">
                                            {offer.payment_terms || "—"}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                                            {offer.validity_days != null ? `${offer.validity_days}d` : "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                            {offer.requires_manual_review && (
                                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Requiere revisión manual">
                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {offers.some((o) => o.total_amount == null) && (
                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                        <FileQuestion className="w-3.5 h-3.5" />
                        Algunas propuestas no pudieron extraer total. Revisar manualmente.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
