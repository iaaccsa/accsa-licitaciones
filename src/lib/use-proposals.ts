import useSWR from "swr";

export async function fetcher<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
}

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
