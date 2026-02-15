import { z } from 'zod';

const ISSUE_CODE = z.string().trim().min(2).max(48).regex(/^[a-z0-9_:-]+$/i, 'Issue codes must be alphanumeric tokens');

const BASE_RATIONALE_SCHEMA = z.object({
    summary: z.string().trim().min(20).max(2000),
    evidenceQuality: z.enum(['strong', 'moderate', 'weak']),
    riskLevel: z.enum(['low', 'medium', 'high']),
    confidenceScore: z.number().int().min(0).max(100),
    issueCodes: z.array(ISSUE_CODE).max(8).default([]),
    citationsChecked: z.boolean(),
    disclosureChecked: z.boolean(),
});

const GENERAL_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    factualityAssessment: z.enum(['verified', 'partially_verified', 'unclear']),
    structureQuality: z.enum(['strong', 'adequate', 'weak']),
});

const CALCULATOR_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    methodologyCheck: z.enum(['passed', 'needs_changes', 'missing']),
    formulaCoverage: z.enum(['full', 'partial', 'none']),
    edgeCasesTested: z.boolean(),
    unitsVerified: z.boolean(),
});

const COMPARISON_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    criteriaCoverage: z.enum(['complete', 'partial', 'insufficient']),
    sourceDiversity: z.enum(['single', 'multiple']),
    affiliateDisclosureChecked: z.boolean(),
});

const LEAD_CAPTURE_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    offerAccuracyChecked: z.boolean(),
    formConsentChecked: z.boolean(),
    disclosurePlacement: z.enum(['above_fold', 'in_form', 'both', 'missing']),
});

const HEALTH_DECISION_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    medicalSafetyReview: z.enum(['complete', 'partial', 'missing']),
    harmRisk: z.enum(['low', 'medium', 'high']),
    professionalCareCtaPresent: z.boolean(),
});

const WIZARD_RATIONALE_SCHEMA = BASE_RATIONALE_SCHEMA.extend({
    branchingLogicValidated: z.boolean(),
    eligibilityCopyClear: z.boolean(),
    fallbackPathTested: z.boolean(),
});

export type StructuredRationale = z.infer<typeof BASE_RATIONALE_SCHEMA> & Record<string, unknown>;

type ReviewStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived' | 'generating';

type ContentType =
    | 'article'
    | 'comparison'
    | 'calculator'
    | 'cost_guide'
    | 'lead_capture'
    | 'health_decision'
    | 'checklist'
    | 'faq'
    | 'review'
    | 'wizard'
    | 'configurator'
    | 'quiz'
    | 'survey'
    | 'assessment'
    | 'interactive_infographic'
    | 'interactive_map';

export function requiresStructuredRationale(fromStatus: string, toStatus: string): boolean {
    const from = fromStatus as ReviewStatus;
    const to = toStatus as ReviewStatus;

    if (from === 'review' && (to === 'approved' || to === 'draft')) return true;
    if (from === 'approved' && (to === 'published' || to === 'draft')) return true;
    return false;
}

function schemaForContentType(contentType: string | null | undefined) {
    const type = (contentType ?? 'article') as ContentType;

    if (type === 'calculator') return CALCULATOR_RATIONALE_SCHEMA;
    if (type === 'comparison' || type === 'review') return COMPARISON_RATIONALE_SCHEMA;
    if (type === 'lead_capture') return LEAD_CAPTURE_RATIONALE_SCHEMA;
    if (type === 'health_decision') return HEALTH_DECISION_RATIONALE_SCHEMA;
    if (type === 'wizard' || type === 'configurator' || type === 'quiz' || type === 'survey' || type === 'assessment') {
        return WIZARD_RATIONALE_SCHEMA;
    }

    return GENERAL_RATIONALE_SCHEMA;
}

export function parseStructuredRationale(input: {
    contentType: string | null | undefined;
    rationale: string | null | undefined;
    rationaleDetails: unknown;
    fromStatus: string;
    toStatus: string;
}): { ok: true; parsed: StructuredRationale } | { ok: false; error: string; details?: Record<string, string[]> } {
    if (!requiresStructuredRationale(input.fromStatus, input.toStatus)) {
        return { ok: true, parsed: {} as StructuredRationale };
    }

    const rationale = (input.rationale ?? '').trim();
    if (rationale.length < 20) {
        return {
            ok: false,
            error: 'Rationale must include at least 20 characters for this transition',
        };
    }

    const schema = schemaForContentType(input.contentType);
    const parsed = schema.safeParse(input.rationaleDetails);
    if (!parsed.success) {
        return {
            ok: false,
            error: 'Structured rationale details are invalid for this content format',
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const details = parsed.data;
    if (input.toStatus === 'draft' && details.issueCodes.length === 0) {
        return {
            ok: false,
            error: 'At least one issue code is required when sending content back to draft',
        };
    }

    return {
        ok: true,
        parsed: details as StructuredRationale,
    };
}
