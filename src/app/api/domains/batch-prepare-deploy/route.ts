import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db, domains, contentQueue } from '@/lib/db';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { prepareDomain, type DomainStrategy } from '@/lib/deploy/prepare-domain';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { processDeployJob } from '@/lib/deploy/processor';
import { randomUUID } from 'node:crypto';

const MAX_PARALLEL = 5;
const MAX_BATCH = 50;

interface BatchResult {
    domain: string;
    domainId: string;
    status: 'success' | 'failed';
    pageCount?: number;
    theme?: string;
    skin?: string;
    error?: string;
    durationMs: number;
}

/**
 * POST /api/domains/batch-prepare-deploy
 *
 * Body: { domainIds: string[], strategy?: DomainStrategy, skipDeploy?: boolean }
 *
 * Runs prepareDomain + deploy for up to 50 domains in parallel batches of 5.
 * Returns results as they complete via streaming JSON.
 */
export async function POST(request: NextRequest) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { domainIds?: string[]; strategy?: DomainStrategy; skipDeploy?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const domainIds = body.domainIds;
    if (!Array.isArray(domainIds) || domainIds.length === 0) {
        return NextResponse.json({ error: 'domainIds array required' }, { status: 400 });
    }
    if (domainIds.length > MAX_BATCH) {
        return NextResponse.json({ error: `Max ${MAX_BATCH} domains per batch` }, { status: 400 });
    }

    const domainRows = await db.select({ id: domains.id, domain: domains.domain, niche: domains.niche })
        .from(domains)
        .where(and(inArray(domains.id, domainIds), isNull(domains.deletedAt)));

    if (domainRows.length === 0) {
        return NextResponse.json({ error: 'No valid domains found' }, { status: 404 });
    }

    const skipDeploy = body.skipDeploy === true;
    const strategy = body.strategy;
    const results: BatchResult[] = [];
    let completed = 0;

    async function processSite(row: typeof domainRows[number]): Promise<BatchResult> {
        const start = Date.now();
        try {
            const nicheOverride = strategy?.niche || row.niche || undefined;
            const result = await prepareDomain(row.id, nicheOverride ? { ...strategy, niche: nicheOverride } : strategy);

            if (!skipDeploy) {
                await db.update(contentQueue).set({ status: 'failed', completedAt: new Date() })
                    .where(and(
                        eq(contentQueue.domainId, row.id),
                        eq(contentQueue.jobType, 'deploy'),
                        inArray(contentQueue.status, ['pending', 'processing']),
                    ));
                const jobId = randomUUID();
                await enqueueContentJob({
                    id: jobId, domainId: row.id, jobType: 'deploy', priority: 1,
                    payload: { domain: row.domain, triggerBuild: true, addCustomDomain: true },
                    status: 'pending', scheduledFor: new Date(), maxAttempts: 3,
                });
                await processDeployJob(jobId);
            }

            completed++;
            return {
                domain: row.domain, domainId: row.id, status: 'success',
                pageCount: result.pageCount, theme: result.theme, skin: result.skin,
                durationMs: Date.now() - start,
            };
        } catch (err) {
            completed++;
            return {
                domain: row.domain, domainId: row.id, status: 'failed',
                error: err instanceof Error ? err.message : 'Unknown error',
                durationMs: Date.now() - start,
            };
        }
    }

    // Process in parallel batches of MAX_PARALLEL
    const startTime = Date.now();
    for (let i = 0; i < domainRows.length; i += MAX_PARALLEL) {
        const batch = domainRows.slice(i, i + MAX_PARALLEL);
        const batchResults = await Promise.all(batch.map(row => processSite(row)));
        results.push(...batchResults);
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
        total: results.length,
        succeeded,
        failed,
        durationMs: Date.now() - startTime,
        results,
    });
}
