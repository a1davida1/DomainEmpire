import { z } from 'zod';

export const siteReviewVerdictSchema = z.enum(['approve', 'needs_work', 'reject']);
export type SiteReviewVerdict = z.infer<typeof siteReviewVerdictSchema>;

export const siteReviewCriterionSchema = z.object({
    score: z.number().min(1).max(5),
    evidence: z.string().default(''),
    fix: z.string().default(''),
});
export type SiteReviewCriterionResult = z.infer<typeof siteReviewCriterionSchema>;

export const siteReviewScoresSchema = z.object({
    credibility: z.object({
        C1: siteReviewCriterionSchema,
        C2: siteReviewCriterionSchema,
        C3: siteReviewCriterionSchema,
        C4: siteReviewCriterionSchema,
        C5: siteReviewCriterionSchema,
        C6: siteReviewCriterionSchema,
    }),
    quality: z.object({
        Q1: siteReviewCriterionSchema,
        Q2: siteReviewCriterionSchema,
        Q3: siteReviewCriterionSchema,
        Q4: siteReviewCriterionSchema,
        Q5: siteReviewCriterionSchema,
    }),
    seo: z.object({
        S1: siteReviewCriterionSchema,
        S2: siteReviewCriterionSchema,
        S3: siteReviewCriterionSchema,
        S4: siteReviewCriterionSchema,
        S5: siteReviewCriterionSchema,
        S6: siteReviewCriterionSchema,
    }),
    network: z.object({
        N1: siteReviewCriterionSchema,
        N2: siteReviewCriterionSchema,
        N3: siteReviewCriterionSchema,
    }),
});
export type SiteReviewScores = z.infer<typeof siteReviewScoresSchema>;

export type SiteReviewCriterionCode =
    | keyof SiteReviewScores['credibility']
    | keyof SiteReviewScores['quality']
    | keyof SiteReviewScores['seo']
    | keyof SiteReviewScores['network'];

export const aiReviewPayloadSchema = z.object({
    overallScore: z.number().min(1).max(100),
    verdict: siteReviewVerdictSchema,
    scores: siteReviewScoresSchema,
    criticalIssues: z.array(z.string()).default([]),
    recommendations: z.array(z.string()).default([]),
}).strict();
export type AiReviewPayload = z.infer<typeof aiReviewPayloadSchema>;

export const siteReviewReportSchema = z.object({
    domainId: z.string().uuid(),
    domain: z.string().min(1),
    reviewedAt: z.string().datetime(),
    overallScore: z.number().min(1).max(100),
    verdict: siteReviewVerdictSchema,
    scores: siteReviewScoresSchema,
    criticalIssues: z.array(z.string()),
    recommendations: z.array(z.string()),
    deterministic: z.object({
        overallScore: z.number().min(1).max(100),
        verdict: siteReviewVerdictSchema,
        scores: siteReviewScoresSchema,
        criticalIssues: z.array(z.string()),
        recommendations: z.array(z.string()),
    }).optional(),
    ai: aiReviewPayloadSchema.nullable().optional(),
    pagesReviewed: z.array(z.object({
        kind: z.enum(['home', 'tool', 'guide']),
        route: z.string(),
        title: z.string().nullable(),
        metaDescription: z.string().nullable(),
        textChars: z.number().int().nonnegative(),
        truncated: z.boolean(),
    })),
    aiMeta: z.object({
        model: z.string(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        cost: z.number().nonnegative(),
        durationMs: z.number().int().nonnegative(),
    }),
}).strict();
export type SiteReviewReport = z.infer<typeof siteReviewReportSchema>;

export function safeParseSiteReviewReport(value: unknown): SiteReviewReport | null {
    const parsed = siteReviewReportSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

