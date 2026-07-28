import { test, type APIRequestContext } from "@playwright/test";
import { expectViewRenders } from "./helpers";

type Discovery = {
    analysisId: string;
    fileId?: string;
    proposalId?: string;
};

const STATUS_PREFERENCE = ["ready", "processing", "pending", "failed"];

// Discovered once per worker; tests in this file share the same worker because
// the config does not enable fullyParallel.
let cached: Discovery | null | undefined;

// Picks a real analysis (preferring the most advanced status) plus one of its
// files and proposals to exercise the dynamic routes. Returns null when the
// backend has no analyses; the tests then skip instead of failing.
async function discover(request: APIRequestContext): Promise<Discovery | null> {
    if (cached !== undefined) return cached;

    const listResponse = await request.get("/api/analyses/list");
    if (!listResponse.ok()) {
        throw new Error(`GET /api/analyses/list failed: ${listResponse.status()}`);
    }
    const analyses = (await listResponse.json()) as Array<{
        id: string;
        status?: string;
    }>;
    const candidates = analyses
        .filter((analysis) => analysis.id)
        .sort(
            (a, b) =>
                (STATUS_PREFERENCE.indexOf(a.status ?? "") + 1 || 99) -
                (STATUS_PREFERENCE.indexOf(b.status ?? "") + 1 || 99),
        )
        .slice(0, 5);

    let best: Discovery | null = null;
    for (const candidate of candidates) {
        const [filesResponse, proposalsResponse] = await Promise.all([
            request.post(`/api/analyses/${candidate.id}/files`),
            request.get(`/api/analyses/${candidate.id}/proposals`),
        ]);
        const files = filesResponse.ok()
            ? ((await filesResponse.json()) as Array<{ id: string }>)
            : [];
        const proposals = proposalsResponse.ok()
            ? ((await proposalsResponse.json()) as Array<{ id: string }>)
            : [];
        const found: Discovery = {
            analysisId: candidate.id,
            fileId: files[0]?.id,
            proposalId: proposals[0]?.id,
        };
        if (found.fileId && found.proposalId) {
            cached = found;
            return cached;
        }
        best ??= found;
    }
    cached = best;
    return cached;
}

const ANALYSIS_VIEWS = ["", "/files", "/flow", "/requirements", "/admissibility", "/admissibility-requirements", "/proposals"];

for (const view of ANALYSIS_VIEWS) {
    test(`renders /analyses/[id]${view}`, async ({ page, request }) => {
        const data = await discover(request);
        test.skip(!data, "no analyses available in the backend");
        await expectViewRenders(page, `/analyses/${data!.analysisId}${view}`);
    });
}

const FILE_VIEWS = ["/chunks", "/chat"];

for (const view of FILE_VIEWS) {
    test(`renders /analyses/[id]/files/[fileId]${view}`, async ({ page, request }) => {
        const data = await discover(request);
        test.skip(!data?.fileId, "no files available in the selected analysis");
        await expectViewRenders(
            page,
            `/analyses/${data!.analysisId}/files/${data!.fileId}${view}`,
        );
    });
}

const PROPOSAL_VIEWS = ["", "/requirements", "/admissibility-requirements"];

for (const view of PROPOSAL_VIEWS) {
    test(`renders /analyses/[id]/proposals/[proposalId]${view}`, async ({ page, request }) => {
        const data = await discover(request);
        test.skip(!data?.proposalId, "no proposals available in the selected analysis");
        await expectViewRenders(
            page,
            `/analyses/${data!.analysisId}/proposals/${data!.proposalId}${view}`,
        );
    });
}

const ADMIN_ANALYSIS_VIEWS = ["", "/events", "/files", "/flow", "/evaluation_system"];

for (const view of ADMIN_ANALYSIS_VIEWS) {
    test(`renders /admin/analyses/[id]${view}`, async ({ page, request }) => {
        const data = await discover(request);
        test.skip(!data, "no analyses available in the backend");
        await expectViewRenders(page, `/admin/analyses/${data!.analysisId}${view}`);
    });
}
