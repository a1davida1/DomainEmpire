import { db } from '@/lib/db';
import { approvalPolicies, articles, qaChecklistResults, reviewEvents, citations } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { YmylLevel } from './ymyl';
import { getYmylCitationThreshold } from './policy-thresholds';
import { getChecklistForArticle } from './qa';

const ROLE_HIERARCHY: Record<string, number> = {
    editor: 1,
    reviewer: 2,
    expert: 3,
    admin: 4,
};

/**
 * Get the approval policy for a given article context.
 */
export async function getApprovalPolicy(opts: {
    domainId: string;
    ymylLevel: YmylLevel;
}) {
    // Try domain-specific first
    const policies = await db.select()
        .from(approvalPolicies)
        .where(eq(approvalPolicies.domainId, opts.domainId))
        .limit(10);

    let policy = policies.find(p => p.ymylLevel === opts.ymylLevel);

    // Fallback to global (null domainId)
    if (!policy) {
        const globals = await db.select()
            .from(approvalPolicies)
            .limit(10);
        policy = globals.find(p => !p.domainId && p.ymylLevel === opts.ymylLevel);
    }

    // Default policy
    if (!policy) {
        return {
            requiredRole: opts.ymylLevel === 'high' ? 'expert' : opts.ymylLevel === 'medium' ? 'reviewer' : 'editor',
            requiresQaChecklist: opts.ymylLevel !== 'none',
            requiresExpertSignoff: opts.ymylLevel === 'high',
            autoPublish: false,
        };
    }

    return {
        requiredRole: policy.requiredRole || 'reviewer',
        requiresQaChecklist: policy.requiresQaChecklist ?? true,
        requiresExpertSignoff: policy.requiresExpertSignoff ?? false,
        autoPublish: policy.autoPublish ?? false,
    };
}

/**
 * Check if an article can transition to the target status.
 */
export async function canTransition(opts: {
    articleId: string;
    domainId: string;
    ymylLevel: YmylLevel;
    targetStatus: string;
    userRole: string;
}): Promise<{ allowed: boolean; reason?: string }> {
    // Only gate publish and approve transitions
    if (opts.targetStatus !== 'published' && opts.targetStatus !== 'approved') {
        return { allowed: true };
    }

    const policy = await getApprovalPolicy({
        domainId: opts.domainId,
        ymylLevel: opts.ymylLevel,
    });

    // Check role
    const userLevel = ROLE_HIERARCHY[opts.userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[policy.requiredRole] || 0;
    if (userLevel < requiredLevel) {
        return {
            allowed: false,
            reason: `Requires ${policy.requiredRole} role or higher (you are ${opts.userRole})`,
        };
    }

    // Check QA checklist
    if (policy.requiresQaChecklist && opts.targetStatus === 'approved') {
        const qaResults = await db
            .select()
            .from(qaChecklistResults)
            .where(eq(qaChecklistResults.articleId, opts.articleId))
            .orderBy(desc(qaChecklistResults.completedAt))
            .limit(1);

        const latestQa = qaResults[0];
        if (!latestQa) {
            return {
                allowed: false,
                reason: 'QA checklist must be completed and all required items passed',
            };
        }

        const [article] = await db
            .select({ contentType: articles.contentType })
            .from(articles)
            .where(eq(articles.id, opts.articleId))
            .limit(1);

        const checklist = await getChecklistForArticle({
            contentType: article?.contentType || undefined,
            ymylLevel: opts.ymylLevel,
        });

        const latestChecks = (latestQa.results || {}) as Record<string, { checked?: boolean }>;
        const requiredIds = checklist.items.filter((item) => item.required).map((item) => item.id);
        const requiredPassed = requiredIds.every((id) => latestChecks[id]?.checked === true);

        if (!requiredPassed) {
            return {
                allowed: false,
                reason: 'QA checklist must be completed and all required items passed',
            };
        }
    }

    // Check expert sign-off
    if (policy.requiresExpertSignoff && opts.targetStatus === 'published') {
        const expertEvents = await db.select()
            .from(reviewEvents)
            .where(
                and(
                    eq(reviewEvents.articleId, opts.articleId),
                    eq(reviewEvents.eventType, 'expert_signed')
                )
            )
            .limit(1);

        if (!expertEvents.length) {
            return {
                allowed: false,
                reason: 'Expert sign-off required for high YMYL content',
            };
        }
    }

    // Check citation minimums for YMYL content before publish.
    if (opts.targetStatus === 'published') {
        const citationThreshold = getYmylCitationThreshold(opts.ymylLevel);
        if (citationThreshold > 0) {
            const [citationStats] = await db.select({
                count: sql<number>`count(*)::int`,
            })
                .from(citations)
                .where(eq(citations.articleId, opts.articleId));

            const citationCount = citationStats?.count || 0;
            if (citationCount < citationThreshold) {
                return {
                    allowed: false,
                    reason: `At least ${citationThreshold} citations are required for ${opts.ymylLevel.toUpperCase()} YMYL content before publication`,
                };
            }
        }
    }

    return { allowed: true };
}
