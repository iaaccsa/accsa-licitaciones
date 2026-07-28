import useSWR from "swr";
import { fetcher } from "@/lib/swr";

export { fetcher };

// Shared hook for the proposals list endpoint. Multiple components on the same
// screen (list, chart, summary, cost card) call this with the same analysisId;
// SWR dedupes them into a single request and caches the result.
export function useProposals<T = unknown>(analysisId: string | null | undefined) {
    const { data, error, isLoading } = useSWR<T[]>(
        analysisId ? `/api/analyses/${analysisId}/proposals` : null,
        fetcher
    );
    return { proposals: data, error, isLoading };
}
