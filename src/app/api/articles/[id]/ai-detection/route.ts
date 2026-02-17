import { NextRequest, NextResponse } from 'next/server';
import { db, articles, apiCallLogs } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { aiLimiter, getClientIp } from '@/lib/rate-limit';
import { eq } from 'drizzle-orm';
import { checkAIDetection, isAIDetectionEnabled } from '@/lib/ai/ai-detection';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_WORD_COUNT = 50;
const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'xmlhttprequest';

// GET /api/articles/[id]/ai-detection — Return current AI detection data
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
    }

    try {
        const row = await db
            .select({
                aiDetectionScore: articles.aiDetectionScore,
                aiDetectionResult: articles.aiDetectionResult,
                aiDetectionCheckedAt: articles.aiDetectionCheckedAt,
            })
            .from(articles)
            .where(eq(articles.id, id))
            .limit(1);

        if (row.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const article = row[0];
        return NextResponse.json({
            score: article.aiDetectionScore,
            result: article.aiDetectionResult,
            checkedAt: article.aiDetectionCheckedAt,
        });
    } catch (error) {
        console.error('Failed to fetch AI detection data:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST /api/articles/[id]/ai-detection — Trigger manual GPTZero scan
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    // Keep route-level CSRF guard as defense-in-depth for this sensitive mutating endpoint.
    // Dashboard clients should call via apiFetch(), which sets this header automatically.
    const csrfHeader = request.headers.get(CSRF_HEADER);
    if (csrfHeader?.toLowerCase() !== CSRF_VALUE) {
        return NextResponse.json(
            { error: 'CSRF validation failed. Use apiFetch() or add X-Requested-With header.' },
            { status: 403 },
        );
    }

    const ip = getClientIp(request) || 'unknown';
    const limit = aiLimiter(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many AI requests. Please slow down.' },
            { status: 429, headers: limit.headers },
        );
    }

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
    }

    if (!isAIDetectionEnabled()) {
        return NextResponse.json(
            { error: 'AI detection is not configured. Set GPTZERO_API_KEY in environment.' },
            { status: 503 },
        );
    }

    try {
        const row = await db
            .select({
                id: articles.id,
                contentMarkdown: articles.contentMarkdown,
                domainId: articles.domainId,
            })
            .from(articles)
            .where(eq(articles.id, id))
            .limit(1);

        if (row.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const article = row[0];
        const content = article.contentMarkdown || '';
        const wordCount = content.split(/\s+/).filter(Boolean).length;

        if (wordCount < MIN_WORD_COUNT) {
            return NextResponse.json(
                { error: `Article content too short for AI detection (${wordCount} words, minimum ${MIN_WORD_COUNT}).` },
                { status: 400 },
            );
        }

        const startTime = Date.now();
        const detectionResult = await checkAIDetection(content);
        const durationMs = Date.now() - startTime;

        const checkedAt = new Date();
        const storedResult = {
            verdict: detectionResult.verdict,
            burstiness: detectionResult.overallBurstiness,
            sentenceCount: detectionResult.sentences.length,
            highProbSentences: detectionResult.sentences
                .filter((s) => s.generatedProb > 0.8)
                .slice(0, 10)
                .map((s) => ({ sentence: s.sentence.slice(0, 200), prob: s.generatedProb })),
        };

        // Update article with detection results
        await db.update(articles).set({
            aiDetectionScore: detectionResult.averageGeneratedProb,
            aiDetectionResult: storedResult,
            aiDetectionCheckedAt: checkedAt,
        }).where(eq(articles.id, id));

        // Log the API call
        await db.insert(apiCallLogs).values({
            articleId: id,
            domainId: article.domainId,
            stage: 'ai_detection',
            modelKey: 'gptzero',
            model: 'gptzero-v2',
            resolvedModel: 'gptzero-v2',
            promptVersion: 'manual.v1',
            routingVersion: 'direct',
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            durationMs,
        });

        return NextResponse.json({
            score: detectionResult.averageGeneratedProb,
            verdict: detectionResult.verdict,
            burstiness: detectionResult.overallBurstiness,
            sentenceCount: detectionResult.sentences.length,
            highProbSentences: storedResult.highProbSentences,
            checkedAt: checkedAt.toISOString(),
        });
    } catch (error) {
        console.error('AI detection check failed:', error);
        if (error instanceof Error && error.message.includes('GPTZero API error')) {
            return NextResponse.json(
                { error: 'GPTZero service unavailable. Please try again later.' },
                { status: 502 },
            );
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
