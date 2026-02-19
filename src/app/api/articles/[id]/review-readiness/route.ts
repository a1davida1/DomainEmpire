import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { articles, reviewTasks } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { getApprovalPolicy } from '@/lib/review/workflow';
import type { YmylLevel } from '@/lib/review/ymyl';
import { getChecklistForArticle, getLatestQaResult } from '@/lib/review/qa';
import { evaluateQualityGate } from '@/lib/review/quality-gate';
import type { QualityAnalysis } from '@/lib/review/content-quality';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_LEVEL: Record<string, number> = {
    editor: 1,
    reviewer: 2,
    expert: 3,
    admin: 4,
};

type ReviewReadinessPayload = {
    article: {
        id: string;
        domainId: string;
        title: string;
        status: string | null;
        ymylLevel: string | null;
        contentType: string | null;
    };
    policy: {
        requiredRole: string;
        requiresQaChecklist: boolean;
        requiresExpertSignoff: boolean;
        autoPublish: boolean;
    };
    roleGate: {
        userRole: string;
        requiredRole: string;
        ok: boolean;
    };
    qaGate: {
        required: boolean;
        ok: boolean;
        requiredTotal: number;
        requiredPassed: number;
        lastCompletedAt: string | null;
    };
    assignmentGate: {
        ok: boolean;
        reviewTaskId: string | null;
        reviewerId: string | null;
    };
    qualityGate: {
        gate: { minQualityScore: number; minWordCount: number; isInteractive: boolean };
        ok: boolean;
        failures: string[];
        quality: {
            score: number;
            status: string;
            metrics: QualityAnalysis['metrics'];
            recommendations: string[];
        };
    };
    canApprove: boolean;
    blockingReasons: string[];
};

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const articleId = params.id;
    if (!UUID_RE.test(articleId)) {
        return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
    }

    const article = await db.query.articles.findFirst({
        where: eq(articles.id, articleId),
        columns: {
            id: true,
            domainId: true,
            title: true,
            status: true,
            ymylLevel: true,
            contentType: true,
            contentMarkdown: true,
            contentHtml: true,
        },
    });

    if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const ymylLevel = (article.ymylLevel || 'none') as YmylLevel;
    const policy = await getApprovalPolicy({
        domainId: article.domainId,
        ymylLevel,
    });

    const requiredRole = policy.requiredRole || 'reviewer';
    const userLevel = ROLE_LEVEL[user.role] || 0;
    const requiredLevel = ROLE_LEVEL[requiredRole] || 0;
    const roleOk = userLevel >= requiredLevel;

    const checklist = await getChecklistForArticle({
        contentType: article.contentType || undefined,
        ymylLevel,
    });
    const requiredIds = checklist.items.filter((item) => item.required).map((item) => item.id);
    const latestQa = await getLatestQaResult(articleId);
    const latestChecks = (latestQa?.results || {}) as Record<string, { checked?: boolean }>;

    const requiredPassed = requiredIds.filter((id) => latestChecks[id]?.checked === true).length;
    const qaOk = policy.requiresQaChecklist ? requiredPassed === requiredIds.length : true;

    let completedAtIso: string | null = null;
    if (latestQa?.completedAt instanceof Date) {
        completedAtIso = latestQa.completedAt.toISOString();
    } else if (latestQa?.completedAt) {
        const parsed = new Date(latestQa.completedAt);
        if (!Number.isNaN(parsed.getTime())) {
            completedAtIso = parsed.toISOString();
        }
    }

    const taskRows = await db.select({
        id: reviewTasks.id,
        reviewerId: reviewTasks.reviewerId,
    })
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'content_publish'),
            eq(reviewTasks.status, 'pending'),
            eq(reviewTasks.articleId, articleId),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1);

    const activeTask = taskRows[0] ?? null;
    const assignmentOk = !activeTask?.reviewerId || activeTask.reviewerId === user.id || user.role === 'admin';

    const evaluation = evaluateQualityGate({
        contentType: article.contentType,
        ymylLevel: article.ymylLevel,
        contentMarkdown: article.contentMarkdown,
        contentHtml: article.contentHtml,
    });
    const qualityOk = evaluation.passed;

    const blockingReasons: string[] = [];
    if ((article.status || 'draft') !== 'review') {
        blockingReasons.push('Article is not currently in review');
    }
    if (!roleOk) {
        blockingReasons.push(`Requires ${requiredRole} role or higher`);
    }
    if (policy.requiresQaChecklist && !qaOk) {
        blockingReasons.push('QA checklist required items are not complete');
    }
    if (!assignmentOk) {
        blockingReasons.push('Review task is assigned to another reviewer');
    }
    if (!qualityOk) {
        blockingReasons.push('Content quality gate not satisfied');
    }

    const canApprove = blockingReasons.length === 0;

    const payload: ReviewReadinessPayload = {
        article: {
            id: article.id,
            domainId: article.domainId,
            title: article.title,
            status: article.status,
            ymylLevel: article.ymylLevel,
            contentType: article.contentType,
        },
        policy: {
            requiredRole,
            requiresQaChecklist: policy.requiresQaChecklist,
            requiresExpertSignoff: policy.requiresExpertSignoff,
            autoPublish: policy.autoPublish,
        },
        roleGate: {
            userRole: user.role,
            requiredRole,
            ok: roleOk,
        },
        qaGate: {
            required: policy.requiresQaChecklist,
            ok: qaOk,
            requiredTotal: requiredIds.length,
            requiredPassed,
            lastCompletedAt: completedAtIso,
        },
        assignmentGate: {
            ok: assignmentOk,
            reviewTaskId: activeTask?.id ?? null,
            reviewerId: activeTask?.reviewerId ?? null,
        },
        qualityGate: {
            gate: evaluation.gate,
            ok: evaluation.passed,
            failures: evaluation.failures,
            quality: {
                score: evaluation.quality.qualityScore,
                status: evaluation.quality.status,
                metrics: evaluation.quality.metrics,
                recommendations: evaluation.quality.recommendations,
            },
        },
        canApprove,
        blockingReasons,
    };

    return NextResponse.json(payload);
}

