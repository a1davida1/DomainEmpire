import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { notDeleted, softDeleteDomain } from '@/lib/db/soft-delete';

// Validation schema for updating a domain
const updateDomainSchema = z.object({
    registrar: z.enum(['godaddy', 'namecheap', 'cloudflare', 'other']).optional(),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalPrice: z.number().optional(),
    status: z.enum(['parked', 'active', 'redirect', 'forsale', 'defensive']).optional(),
    bucket: z.enum(['build', 'redirect', 'park', 'defensive']).optional(),
    tier: z.number().min(1).max(3).optional(),
    niche: z.string().optional(),
    subNiche: z.string().optional(),
    siteTemplate: z.enum(['authority', 'comparison', 'calculator', 'review', 'tool', 'hub', 'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand']).optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    redirectTargetId: z.string().uuid().optional().nullable(),
    githubRepo: z.string().optional(),
    cloudflareProject: z.string().optional(),
}).partial();

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/domains/[id] - Get a single domain
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        const result = await db
            .select()
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ domain: result[0] });
    } catch (error) {
        console.error('Failed to fetch domain:', error);
        return NextResponse.json(
            { error: 'Failed to fetch domain' },
            { status: 500 }
        );
    }
}

// PATCH /api/domains/[id] - Update a domain
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        // Parse JSON with explicit error handling
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        const validationResult = updateDomainSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: validationResult.error.flatten() },
                { status: 400 }
            );
        }

        const data = validationResult.data;

        // Perform atomic update and check existence in one operation (eliminates TOCTOU)
        const updated = await db
            .update(domains)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .returning();

        if (updated.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ domain: updated[0] });
    } catch (error) {
        console.error('Failed to update domain:', error);
        return NextResponse.json(
            { error: 'Failed to update domain' },
            { status: 500 }
        );
    }
}

// DELETE /api/domains/[id] - Soft-delete a domain (and cascade to articles)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        const { domain } = await softDeleteDomain(id);

        if (!domain) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Domain ${domain} deleted`,
            restorable: true,
        });
    } catch (error) {
        console.error('Failed to delete domain:', error);
        return NextResponse.json(
            { error: 'Failed to delete domain' },
            { status: 500 }
        );
    }
}
