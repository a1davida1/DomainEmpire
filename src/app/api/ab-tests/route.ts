/**
 * A/B Tests API - List and create tests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abTests, articles } from '@/lib/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import { createTest } from '@/lib/ab-testing';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const status = request.nextUrl.searchParams.get('status');

        const tests = await db.select().from(abTests).orderBy(desc(abTests.createdAt));

        const filtered = status ? tests.filter(t => t.status === status) : tests;

        // Fetch article titles
        const articleIds = [...new Set(filtered.map(t => t.articleId))];
        const articleList = articleIds.length > 0
            ? await db.select({ id: articles.id, title: articles.title }).from(articles).where(inArray(articles.id, articleIds))
            : [];
        const articleMap = new Map(articleList.map(a => [a.id, a.title]));

        return NextResponse.json({
            tests: filtered.map(t => ({
                ...t,
                articleTitle: articleMap.get(t.articleId) || 'Unknown',
            })),
        });
    } catch (error) {
        console.error('A/B tests list error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }
        const { articleId, testType, variants } = body;

        if (!articleId || !testType || !Array.isArray(variants) || variants.length < 2) {
            return NextResponse.json(
                { error: 'articleId, testType, and at least 2 variants required' },
                { status: 400 },
            );
        }

        const validTypes = ['title', 'meta_description', 'cta'];
        if (!validTypes.includes(testType)) {
            return NextResponse.json(
                { error: `testType must be one of: ${validTypes.join(', ')}` },
                { status: 400 },
            );
        }

        // Verify article exists
        const article = await db.select({ id: articles.id }).from(articles)
            .where(eq(articles.id, articleId)).limit(1);
        if (article.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const test = await createTest(articleId, testType, variants);
        return NextResponse.json({ test }, { status: 201 });
    } catch (error) {
        console.error('A/B test create error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
