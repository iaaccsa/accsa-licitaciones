"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    "N/A": number;
}

export default function ProposalsComplianceChart({ analysisId }: { analysisId: string }) {
    const [data, setData] = useState<ChartEntry[]>([]);

    useEffect(() => {
        fetch(`/api/analyses/${analysisId}/proposals`)
            .then((r) => r.json())
            .then((proposals: Proposal[]) => {
                const entries = proposals
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
                        "N/A": p.unprocessable_count ?? 0,
                    }));
                setData(entries);
            })
            .catch(() => {});
    }, [analysisId]);

    if (data.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Comparativa de Cumplimiento</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Cumple" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="No cumple" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Sin info" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="N/A" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
