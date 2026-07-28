"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProposals } from "@/lib/use-proposals";

interface Proposal {
    id: string;
    label: string | null;
    provider_name: string | null;
    compliant_count: number | null;
    non_compliant_count: number | null;
    missing_info_count: number | null;
    unprocessable_count: number | null;
}

interface ChartEntry {
    name: string;
    Cumple: number;
    "No cumple": number;
    "Sin info": number;
    "No procesado": number;
}

export default function ProposalsComplianceChart({ analysisId }: { analysisId: string }) {
    const { proposals } = useProposals<Proposal>(analysisId);
    // Recharts takes colors as props, not classes; resolve them from the theme.
    const { resolvedTheme } = useTheme();
    const dark = resolvedTheme === "dark";

    const data = useMemo<ChartEntry[]>(
        () =>
            (proposals ?? [])
                .filter((p) =>
                    p.compliant_count != null ||
                    p.non_compliant_count != null ||
                    p.missing_info_count != null ||
                    p.unprocessable_count != null
                )
                .map((p) => ({
                    name: p.label || p.provider_name || p.id,
                    Cumple: p.compliant_count ?? 0,
                    "No cumple": p.non_compliant_count ?? 0,
                    "Sin info": p.missing_info_count ?? 0,
                    "No procesado": p.unprocessable_count ?? 0,
                })),
        [proposals]
    );

    if (data.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Comparativa de Cumplimiento</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#27272a" : "#f4f4f5"} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: dark ? "#a1a1aa" : "#71717a" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: dark ? "#a1a1aa" : "#71717a" }} />
                        <Tooltip
                            contentStyle={
                                dark
                                    ? {
                                          backgroundColor: "#18181b",
                                          border: "1px solid #3f3f46",
                                          borderRadius: 8,
                                      }
                                    : undefined
                            }
                            labelStyle={dark ? { color: "#f4f4f5" } : undefined}
                        />
                        <Legend />
                        <Bar dataKey="Cumple" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="No cumple" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Sin info" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="No procesado" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
