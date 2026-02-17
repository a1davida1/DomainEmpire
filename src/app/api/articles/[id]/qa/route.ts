import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { getChecklistForArticle, submitChecklist, getLatestQaResult } from '@/lib/review/qa';
import { logReviewEvent } from '@/lib/audit/events';
import { eq } from 'drizzle-orm';
import { hashCalculatorConfigForTestPass } from '@/lib/review/calculation-integrity';

const UNIT_TEST_PASS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const DEFAULT_CALCULATION_HARNESS_VERSION = 'calculator-harness.v1';

// GET /api/articles/[id]/qa — get QA checklist + latest result
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const article = await db.query.articles.findFirst({
        where: eq(articles.id, params.id),
        columns: { ymylLevel: true, status: true },
    });

    if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const checklist = await getChecklistForArticle({
        ymylLevel: (article.ymylLevel as 'none' | 'low' | 'medium' | 'high') || 'none',
    });

    const latestResult = await getLatestQaResult(params.id);

    return NextResponse.json({ checklist, latestResult });
}

// POST /api/articles/[id]/qa — submit QA checklist results
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const templateId = typeof body.templateId === 'string' ? body.templateId : null;
        const unitTestPassId = body.unitTestPassId;
        const calculationHarnessVersion = body.calculationHarnessVersion;
        const results = body.results;

        if (!results || typeof results !== 'object') {
            return NextResponse.json({ error: 'Results object is required' }, { status: 400 });
        }

        const typedResults = results as Record<string, { checked: boolean; notes?: string }>;

        const article = await db.query.articles.findFirst({
            where: eq(articles.id, params.id),
            columns: {
                id: true,
                contentType: true,
                calculatorConfig: true,
            },
        });
        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const normalizedUnitTestPassId = typeof unitTestPassId === 'string' ? unitTestPassId.trim() : '';
        if (normalizedUnitTestPassId.length > 0 && !UNIT_TEST_PASS_ID_PATTERN.test(normalizedUnitTestPassId)) {
            return NextResponse.json(
                { error: 'Invalid unitTestPassId format' },
                { status: 400 },
            );
        }

        const calcTested = Boolean(typedResults.calc_tested?.checked);
        if (article.contentType === 'calculator' && calcTested && normalizedUnitTestPassId.length === 0) {
            return NextResponse.json(
                { error: 'unitTestPassId is required when calc_tested is checked for calculator content' },
                { status: 400 },
            );
        }

        let calculationConfigHash: string | null = null;
        if (normalizedUnitTestPassId.length > 0 && article.contentType === 'calculator') {
            calculationConfigHash = hashCalculatorConfigForTestPass(article.calculatorConfig);
            if (!calculationConfigHash) {
                return NextResponse.json(
                    { error: 'Calculator config is required before recording a deterministic test pass' },
                    { status: 400 },
                );
            }
        }

        const normalizedHarnessVersion = typeof calculationHarnessVersion === 'string'
            ? calculationHarnessVersion.trim()
            : '';

        const { id, allPassed } = await submitChecklist({
            articleId: params.id,
            templateId: templateId || null,
            reviewerId: user.id,
            results: typedResults,
            unitTestPassId: normalizedUnitTestPassId || null,
            calculationConfigHash,
            calculationHarnessVersion: normalizedUnitTestPassId.length > 0
                ? (normalizedHarnessVersion || DEFAULT_CALCULATION_HARNESS_VERSION)
                : null,
        });

        await logReviewEvent({
            articleId: params.id,
            actorId: user.id,
            actorRole: user.role,
            eventType: 'qa_completed',
            metadata: {
                allPassed,
                templateId,
                unitTestPassId: normalizedUnitTestPassId || null,
                calculationConfigHash,
            },
        });

        return NextResponse.json({ id, allPassed });
    } catch (error) {
        console.error('Failed to submit QA checklist:', error);
        return NextResponse.json({ error: 'Failed to submit checklist' }, { status: 500 });
    }
}
