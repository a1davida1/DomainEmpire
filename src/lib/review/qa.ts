import { db } from '@/lib/db';
import { qaChecklistTemplates, qaChecklistResults } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { YmylLevel } from './ymyl';

export type ChecklistItem = {
    id: string;
    category: string;
    label: string;
    required: boolean;
};

/**
 * Get or create the appropriate QA checklist template for an article.
 */
export async function getChecklistForArticle(opts: {
    contentType?: string;
    ymylLevel?: YmylLevel;
}) {
    // Try exact match first
    const templates = await db.select()
        .from(qaChecklistTemplates)
        .limit(10);

    // Find best match: content type + YMYL level
    let best = templates.find(t =>
        t.contentType === (opts.contentType || 'article') &&
        t.ymylLevel === (opts.ymylLevel || 'none')
    );

    // Fallback: match by YMYL level only
    if (!best) {
        best = templates.find(t => t.ymylLevel === (opts.ymylLevel || 'none'));
    }

    // Fallback: any template
    if (!best && templates.length > 0) {
        best = templates[0];
    }

    // If no templates exist, return default
    if (!best) {
        return {
            id: null,
            name: 'Default QA Checklist',
            items: getDefaultChecklist(opts.ymylLevel || 'none'),
        };
    }

    return {
        id: best.id,
        name: best.name,
        items: (best.items || []) as ChecklistItem[],
    };
}

export function getDefaultChecklist(ymylLevel: YmylLevel): ChecklistItem[] {
    const items: ChecklistItem[] = [
        { id: 'purpose', category: 'purpose', label: 'Page purpose is clear and user-benefiting', required: true },
        { id: 'accuracy', category: 'claim_coverage', label: 'Key claims are factually accurate', required: true },
        { id: 'grammar', category: 'ux', label: 'No grammar or spelling errors', required: true },
        { id: 'formatting', category: 'ux', label: 'Proper heading hierarchy and formatting', required: false },
        { id: 'links', category: 'ux', label: 'All links are functional', required: false },
    ];

    if (ymylLevel === 'medium' || ymylLevel === 'high') {
        items.push(
            { id: 'citations', category: 'claim_coverage', label: 'Non-trivial claims have citations', required: true },
            { id: 'stats_sourced', category: 'claim_coverage', label: 'Statistics include source and date', required: true },
            { id: 'disclosure', category: 'disclosure', label: 'Required disclosures are present', required: true },
        );
    }

    if (ymylLevel === 'high') {
        items.push(
            { id: 'not_advice', category: 'disclosure', label: 'Not-advice disclaimer present for YMYL content', required: true },
            { id: 'expert_review', category: 'claim_coverage', label: 'Content reviewed by qualified expert', required: true },
            { id: 'calc_tested', category: 'calculation_integrity', label: 'Formulas/calculations tested with edge cases', required: false },
            { id: 'units', category: 'calculation_integrity', label: 'Unit labels are correct', required: false },
        );
    }

    return items;
}

export async function submitChecklist(opts: {
    articleId: string;
    templateId: string | null;
    reviewerId: string;
    results: Record<string, { checked: boolean; notes?: string }>;
}) {
    const items = Object.values(opts.results);
    const allPassed = items.every(r => r.checked);

    const [result] = await db.insert(qaChecklistResults).values({
        articleId: opts.articleId,
        templateId: opts.templateId,
        reviewerId: opts.reviewerId,
        results: opts.results,
        allPassed,
        completedAt: new Date(),
    }).returning({ id: qaChecklistResults.id });

    return { id: result.id, allPassed };
}

export async function getLatestQaResult(articleId: string) {
    const results = await db.select()
        .from(qaChecklistResults)
        .where(eq(qaChecklistResults.articleId, articleId))
        .orderBy(qaChecklistResults.completedAt)
        .limit(1);

    return results[0] || null;
}
