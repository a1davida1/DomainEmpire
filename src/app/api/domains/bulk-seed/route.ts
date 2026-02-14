import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { enqueueContentJob } from '@/lib/queue/content-queue';

const bulkSeedSchema = z.object({
    domainIds: z.array(z.string()).optional(),
    tier: z.number().int().min(1).max(3).optional(),
    status: z.enum(['parked', 'active', 'redirect', 'forsale', 'defensive']).optional(),
    articleCount: z.number().int().min(1).max(10).default(5),
    priority: z.number().int().min(1).max(10).default(5),
});

// POST /api/domains/bulk-seed - Seed multiple domains at once
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { domainIds, tier, status, articleCount, priority } = bulkSeedSchema.parse(body);

        // Build query conditions (always exclude soft-deleted)
        const conditions = [isNull(domains.deletedAt)];

        if (domainIds && domainIds.length > 0) {
            conditions.push(inArray(domains.id, domainIds));
        }
        if (tier !== undefined) {
            conditions.push(eq(domains.tier, tier));
        }
        if (status) {
            conditions.push(eq(domains.status, status));
        }

        // Get matching domains
        let query = db.select().from(domains);
        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as typeof query;
        }

        const targetDomains = await query.limit(50); // Safety limit

        if (targetDomains.length === 0) {
            return NextResponse.json({ error: 'No domains match criteria' }, { status: 400 });
        }

        // Queue bulk_seed jobs for each domain (this is a valid job type in schema)
        const queuedDomains: Array<{ id: string; domain: string; jobId: string }> = [];

        for (const domain of targetDomains) {
            const jobId = randomUUID();

            await enqueueContentJob({
                id: jobId,
                domainId: domain.id,
                jobType: 'bulk_seed', // Valid job type in schema
                priority,
                payload: {
                    domain: domain.domain,
                    niche: domain.niche,
                    subNiche: domain.subNiche,
                    articleCount,
                },
                status: 'pending',
                scheduledFor: new Date(),
                maxAttempts: 3,
            });

            queuedDomains.push({
                id: domain.id,
                domain: domain.domain,
                jobId,
            });
        }

        return NextResponse.json({
            success: true,
            domainsQueued: queuedDomains.length,
            articlesPerDomain: articleCount,
            totalArticlesEstimate: queuedDomains.length * articleCount,
            domains: queuedDomains,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Bulk seed failed:', error);
        return NextResponse.json(
            { error: 'Failed to seed domains' },
            { status: 500 }
        );
    }
}
