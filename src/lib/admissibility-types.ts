// Types mirroring the API admissibility schemas
// (accsa-licitaciones-api/app/schemas/admissibility_{requirement,result}.py).

export type Confidence = "alta" | "media" | "baja" | "muy_baja";

export type ComplianceVerdict =
    | "cumple"
    | "cumple_parcial"
    | "no_cumple"
    | "no_evidencia"
    | "no_aplica"
    | "requiere_verificacion_manual";

export type AdmissibilityRole = "admisibilidad_obligatoria" | "admisibilidad_subsanable";

// Only mandatory admissibility requirements are exclusionary: failing one rejects the proposal.
export const EXCLUSIONARY_ROLE = "admisibilidad_obligatoria";

export function isExclusionary(roles: string[]): boolean {
    return roles.includes(EXCLUSIONARY_ROLE);
}

export interface AdmissibilityRequirementCitation {
    chunk_id: string;
    page_number: number | null;
    filename: string | null;
    snippet: string;
}

export interface AdmissibilityRequirement {
    id: string;
    analysis_id: string;
    requirement_code: string;
    requirement_text: string;
    requirement_summary: string | null;
    roles: string[];
    domain: string;
    verification_method: string;
    temporal_scope: string;
    citations: AdmissibilityRequirementCitation[];
    confidence: Confidence;
    extraction_batch_id: number | null;
    is_verified: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdmissibilityResultCitation {
    chunk_id: string;
    snippet: string;
    header: string | null;
    chunk_index: number | null;
    page_number: number | null;
    filename: string | null;
}

export interface AdmissibilityResultRequirement {
    id: string;
    requirement_code: string;
    requirement_text: string;
    requirement_summary: string | null;
    roles: string[];
    domain: string;
    verification_method: string;
    temporal_scope: string;
}

export interface AdmissibilityResult {
    id: string;
    analysis_id: string;
    requirement_id: string;
    proposal_id: string;
    verdict: ComplianceVerdict;
    confidence: string;
    reasoning: string | null;
    missing_elements: string[];
    citations: AdmissibilityResultCitation[];
    manual_verification_required: boolean;
    extraction_batch_id: number | null;
    is_verified: boolean;
    reviewed_by: string | null;
    reviewed_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    requirement: AdmissibilityResultRequirement;
}
