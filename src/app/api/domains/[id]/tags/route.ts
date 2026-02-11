import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const tagsSchema = z.object({
    tags: z.array(z.string().min(1).max(50)).max(20),
});

// GET /api/domains/:id/tags — Get domain tags
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const domain = await db.select({ tags: domains.tags }).from(domains).where(eq(domains.id, id)).limit(1);
        if (!domain.length) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        return NextResponse.json({ tags: domain[0].tags || [] });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch tags', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// PUT /api/domains/:id/tags — Set domain tags
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const body = await request.json();
        const parsed = tagsSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const result = await db.update(domains)
            .set({ tags: parsed.data.tags })
            .where(eq(domains.id, id))
            .returning({ id: domains.id });

        if (!result.length) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        return NextResponse.json({ tags: parsed.data.tags });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to update tags', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
