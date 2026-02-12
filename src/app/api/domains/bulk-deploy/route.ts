import { NextRequest, NextResponse } from 'next/server';
import { db, domains, contentQueue } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const bulkDeploySchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1).max(50),
    createRepo: z.boolean().default(true),
    triggerBuild: z.boolean().default(true),
    addCustomDomain: z.boolean().default(true),
});

// POST /api/domains/bulk-deploy - Deploy multiple domains
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
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

        const { domainIds, createRepo, triggerBuild, addCustomDomain } = bulkDeploySchema.parse(body);

        // Deduplicate domainIds to handle duplicates correctly
        const uniqueDomainIds = [...new Set(domainIds)];

        // Verify all domains exist
        const existingDomains = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(inArray(domains.id, uniqueDomainIds));

        if (existingDomains.length !== uniqueDomainIds.length) {
            return NextResponse.json({ error: 'Some domains not found' }, { status: 404 });
        }

        // Build batch of job records
        const jobRecords = existingDomains.map((domain) => {
            const jobId = randomUUID();
            return {
                record: {
                    id: jobId,
                    domainId: domain.id,
                    jobType: 'deploy' as const,
                    priority: 3,
                    payload: {
                        domain: domain.domain,
                        createRepo,
                        triggerBuild,
                        addCustomDomain,
                    },
                    status: 'pending' as const,
                    scheduledFor: new Date(),
                    maxAttempts: 3,
                },
                meta: { domainId: domain.id, domain: domain.domain, jobId },
            };
        });

        // Perform atomic bulk insert within a transaction
        const jobs: Array<{ domainId: string; domain: string; jobId: string }> = [];

        await db.transaction(async (tx) => {
            // Single bulk insert for all jobs
            await tx.insert(contentQueue).values(jobRecords.map(j => j.record));

            // Populate jobs array after successful insert
            for (const j of jobRecords) {
                jobs.push(j.meta);
            }
        });

        return NextResponse.json({
            success: true,
            queued: jobs.length,
            jobs,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        console.error('Bulk deploy failed:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to queue bulk deployment' }, { status: 500 });
    }
}
