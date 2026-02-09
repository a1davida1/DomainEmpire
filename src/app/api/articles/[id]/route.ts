import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, ne } from 'drizzle-orm';

// PATCH /api/articles/[id] - Update article content
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;

    try {
        const body = await request.json();
        const { title, slug, content, targetKeyword, metaDescription } = body;

        // Basic validation
        if (!title || !slug) {
            return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
        }

        // Check if article exists
        const existingDefault = await db.query.articles.findFirst({
            where: eq(articles.id, id),
        });

        if (!existingDefault) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        // Check for duplicate slug (another article with same slug)
        const duplicateSlug = await db.query.articles.findFirst({
            where: and(
                eq(articles.slug, slug),
                ne(articles.id, id)
            ),
        });

        if (duplicateSlug) {
            return NextResponse.json(
                { error: 'Slug already exists. Please choose a different slug.' },
                { status: 409 }
            );
        }

        // Update article
        await db.update(articles)
            .set({
                title,
                slug,
                contentMarkdown: content,
                targetKeyword,
                metaDescription,
                updatedAt: new Date(),
            })
            .where(eq(articles.id, id));

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Failed to update article:', error);
        return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
    }
}
