"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { fetcher, useProposals } from "@/lib/use-proposals";

interface CostRow {
  cost: number;
  calls: number;
}
interface ByProposal extends CostRow {
  proposal_id: string | null;
}
interface ByProvider extends CostRow {
  provider: string;
}
interface ByModel extends CostRow {
  provider: string;
  model: string;
  operation: string;
}
interface CostSummary {
  currency: string;
  total_cost: number;
  total_calls: number;
  by_proposal: ByProposal[];
  by_provider: ByProvider[];
  by_model: ByModel[];
}
interface Proposal {
  id: string;
  label: string | null;
  provider_name: string | null;
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2).replace(".", ",")}`;
}

export default function AnalysisCostCard({ analysisId }: { analysisId: string }) {
  const { data: cost } = useSWR<CostSummary>(
    `/api/analyses/${analysisId}/cost`,
    fetcher
  );
  const { proposals } = useProposals<Proposal>(analysisId);

  const names = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (proposals ?? []).forEach((p) => {
      m[p.id] = p.label || p.provider_name || p.id.slice(0, 8);
    });
    return m;
  }, [proposals]);

  if (!cost || cost.total_calls === 0) return null;

  const proposalName = (pid: string | null) =>
    pid ? names[pid] || pid.slice(0, 8) : "General";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Costos de IA
          </span>
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {fmtUsd(cost.total_cost)}
            <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              {cost.total_calls} llamadas
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <CostList
          title="Por propuesta"
          rows={cost.by_proposal.map((r) => ({
            label: proposalName(r.proposal_id),
            cost: r.cost,
            calls: r.calls,
          }))}
        />
        <CostList
          title="Por provider"
          rows={cost.by_provider.map((r) => ({
            label: r.provider,
            cost: r.cost,
            calls: r.calls,
          }))}
        />
        <CostList
          title="Por modelo"
          rows={cost.by_model.map((r) => ({
            label: r.model,
            sub: r.operation,
            cost: r.cost,
            calls: r.calls,
          }))}
        />
      </CardContent>
    </Card>
  );
}

function CostList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; sub?: string; cost: number; calls: number }[];
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
        {title}
      </h4>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="truncate text-zinc-700 dark:text-zinc-300">
              {r.label}
              {r.sub && (
                <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">{r.sub}</span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {fmtUsd(r.cost)}
              </span>
              <span
                className="ml-2 text-xs text-zinc-400 dark:text-zinc-500"
                title="llamadas"
              >
                {r.calls}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
