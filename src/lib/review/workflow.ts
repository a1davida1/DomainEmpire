import { db } from '@/lib/db';
import { approvalPolicies, qaChecklistResults, reviewEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { YmylLevel } from './ymyl';

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
        const qaResults = await db.select()
            .from(qaChecklistResults)
            .where(eq(qaChecklistResults.articleId, opts.articleId))
            .limit(1);

        const latestQa = qaResults[0];
        if (!latestQa || !latestQa.allPassed) {
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

    return { allowed: true };
}
