import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { withIdempotency } from '@/lib/api/idempotency';
import { reviewSite } from '@/lib/deploy/site-review';

interface PageProps {
    params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/domains/[id]/review — run site review and persist results
export const POST = withIdempotency(async (request: NextRequest, { params }: PageProps) => {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: 'Invalid domain ID format' }, { status: 400 });
    }

    try {
        const domainResult = await db
            .select({
                id: domains.id,
                domain: domains.domain,
            })
            .from(domains)
            .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const report = await reviewSite(id);

        await db.update(domains).set({
            lastReviewResult: report as unknown as Record<string, unknown>,
            lastReviewScore: Math.round(report.overallScore),
            lastReviewedAt: new Date(report.reviewedAt),
            updatedAt: new Date(),
        }).where(eq(domains.id, id));

        return NextResponse.json({
            success: true,
            domain: domainResult[0].domain,
            report,
        });
    } catch (error) {
        console.error('Domain site review failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to review site' },
            { status: 500 },
        );
    }
});

