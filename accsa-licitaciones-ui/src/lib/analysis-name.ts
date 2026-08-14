// The AI names an analysis only at the sixth step of the pipeline, and the slug
// is an 8 hex digit database default, so until then every analysis was shown as
// something like "375da665". Fall back to the creation date instead, which the
// user can actually recognise. The slug stays visible on its own as the id.

interface NameableAnalysis {
    slug: string;
    user_assigned_name?: string | null;
    generated_name?: string | null;
    created_at?: string | null;
}

export function provisionalAnalysisName(createdAt?: string | null): string {
    if (!createdAt) return "Análisis sin nombre";
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return "Análisis sin nombre";
    return `Análisis del ${date.toLocaleDateString("es-UY", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    })}`;
}

export function displayAnalysisName(analysis: NameableAnalysis): string {
    return (
        analysis.user_assigned_name ||
        analysis.generated_name ||
        provisionalAnalysisName(analysis.created_at)
    );
}
