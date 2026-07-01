// Shared SWR fetchers. GET endpoints use a string key; POST "search" endpoints
// use a tuple key [url, body] so SWR can cache/dedupe by URL + payload.

export async function fetcher<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
}

export async function postFetcher<T>([url, body]: [string, unknown?]): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        ...(body !== undefined
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : {}),
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
}
