import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { and, inArray, isNull } from 'drizzle-orm';
import { prepareDomain, type DomainStrategy } from '@/lib/deploy/prepare-domain';
import { deployDomainInline } from '@/lib/deploy/processor';
import { z } from 'zod';
import { withIdempotency } from '@/lib/api/idempotency';

const MAX_PARALLEL = 5;
const MAX_BATCH = 50;

const strategySchema = z.object({
    wave: z.number().int().optional(),
    cluster: z.string().min(1).max(120).optional(),
    niche: z.string().min(1).max(120).optional(),
    subNiche: z.string().min(1).max(120).optional(),
    vertical: z.string().min(1).max(120).optional(),
    siteTemplate: z.string().min(1).max(120).optional(),
    monetizationTier: z.number().int().min(1).max(5).optional(),
    homeTitle: z.string().min(1).max(200).optional(),
    homeMeta: z.string().min(1).max(320).optional(),
}).strict();

const batchPrepareDeploySchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
    strategy: strategySchema.optional(),
    skipDeploy: z.boolean().optional(),
}).strict();

interface BatchResult {
    domain: string;
    domainId: string;
    status: 'success' | 'failed';
    deployStatus?: 'skipped' | 'queued' | 'already_running';
    deployJobId?: string;
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
 * Runs prepareDomain for up to 50 domains in parallel batches of 5.
 * Deploys run inline per domain (no queue wait).
 */
async function postBatchPrepareDeploy(request: NextRequest): Promise<NextResponse> {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = batchPrepareDeploySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const domainIds = parsed.data.domainIds;
    const strategy = parsed.data.strategy as DomainStrategy | undefined;
    const skipDeploy = parsed.data.skipDeploy === true;

    const domainRows = await db.select({ id: domains.id, domain: domains.domain, niche: domains.niche })
        .from(domains)
        .where(and(inArray(domains.id, domainIds), isNull(domains.deletedAt)));

    if (domainRows.length === 0) {
        return NextResponse.json({ error: 'No valid domains found' }, { status: 404 });
    }

    const results: BatchResult[] = [];

    async function processSite(row: typeof domainRows[number]): Promise<BatchResult> {
        const start = Date.now();
        try {
            const nicheOverride = strategy?.niche || row.niche || undefined;
            const result = await prepareDomain(row.id, nicheOverride ? { ...strategy, niche: nicheOverride } : strategy);

            let deployStatus: BatchResult['deployStatus'] = 'skipped';
            let deployJobId: string | undefined;

            if (!skipDeploy) {
                const deployResult = await deployDomainInline({
                    domainId: row.id,
                    domain: row.domain,
                    triggerBuild: true,
                    addCustomDomain: true,
                });
                deployJobId = deployResult.jobId;
                deployStatus = deployResult.success ? 'queued' : 'skipped';
            }

            return {
                domain: row.domain, domainId: row.id, status: 'success',
                deployStatus,
                deployJobId,
                pageCount: result.pageCount, theme: result.theme, skin: result.skin,
                durationMs: Date.now() - start,
            };
        } catch (err) {
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
        const batchResults = await Promise.all(batch.map((row: typeof domainRows[number]) => processSite(row)));
        results.push(...batchResults);
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const queued = results.filter(r => r.deployStatus === 'queued').length;
    const alreadyRunning = results.filter(r => r.deployStatus === 'already_running').length;

    return NextResponse.json({
        total: results.length,
        succeeded,
        failed,
        queued,
        alreadyRunning,
        durationMs: Date.now() - startTime,
        results,
    });
}

export const POST = withIdempotency(postBatchPrepareDeploy);
