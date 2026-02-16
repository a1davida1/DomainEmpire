import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { and, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { enqueueContentJobs, requeueContentJobIds } from '@/lib/queue/content-queue';
import { type DeployPreflightResult, runDeployPreflight } from '@/lib/deploy/preflight';

const bulkDeploySchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1).max(50),
    triggerBuild: z.boolean().default(true),
    addCustomDomain: z.boolean().default(true),
    dryRun: z.boolean().default(false),
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

        const { domainIds, triggerBuild, addCustomDomain, dryRun } = bulkDeploySchema.parse(body);

        // Deduplicate domainIds to handle duplicates correctly
        const uniqueDomainIds = [...new Set(domainIds)];

        // Verify all domains exist
        const existingDomains = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                niche: domains.niche,
                registrar: domains.registrar,
                cloudflareAccount: domains.cloudflareAccount,
            })
            .from(domains)
            .where(and(inArray(domains.id, uniqueDomainIds), isNull(domains.deletedAt)));

        if (existingDomains.length !== uniqueDomainIds.length) {
            return NextResponse.json({ error: 'Some domains not found' }, { status: 404 });
        }

        const preflightEvaluations = await Promise.all(existingDomains.map(async (domain) => {
            let preflight: DeployPreflightResult;
            try {
                preflight = await runDeployPreflight({
                    domain: domain.domain,
                    registrar: domain.registrar,
                    addCustomDomain,
                    cloudflareAccount: domain.cloudflareAccount ?? null,
                    domainNiche: domain.niche ?? null,
                });
            } catch (preflightError) {
                const message = preflightError instanceof Error ? preflightError.message : 'Unknown preflight error';
                console.error('Bulk deploy preflight failed:', {
                    domainId: domain.id,
                    domain: domain.domain,
                    error: message,
                });
                preflight = {
                    ok: false,
                    zoneNameservers: null,
                    issues: [{
                        code: 'deploy_preflight_unavailable',
                        severity: 'blocking',
                        message: `Preflight failed for ${domain.domain}: ${message}`,
                    }],
                };
            }

            return {
                domainId: domain.id,
                domain: domain.domain,
                registrar: domain.registrar,
                cloudflareAccount: domain.cloudflareAccount,
                preflight,
            };
        }));

        const blockedDomains = preflightEvaluations
            .filter((evaluation) => !evaluation.preflight.ok)
            .map((evaluation) => ({
                domainId: evaluation.domainId,
                domain: evaluation.domain,
                issues: evaluation.preflight.issues.filter((issue) => issue.severity === 'blocking'),
            }));

        const eligibleDomains = preflightEvaluations.filter((evaluation) => evaluation.preflight.ok);
        const preflightWarnings = preflightEvaluations.flatMap((evaluation) => {
            const warnings = evaluation.preflight.issues.filter((issue) => issue.severity === 'warning');
            if (warnings.length === 0) return [];
            return [{
                domainId: evaluation.domainId,
                domain: evaluation.domain,
                issues: warnings,
            }];
        });

        if (dryRun) {
            return NextResponse.json({
                success: eligibleDomains.length > 0,
                dryRun: true,
                requested: uniqueDomainIds.length,
                queueable: eligibleDomains.length,
                blocked: blockedDomains.length,
                blockedDomains,
                preflightWarnings,
            });
        }

        if (eligibleDomains.length === 0) {
            return NextResponse.json(
                {
                    error: 'Deployment preflight failed for all requested domains',
                    blockedDomains,
                },
                { status: 400 },
            );
        }

        // Build batch of job records
        const jobRecords = eligibleDomains.map((evaluation) => {
            const jobId = randomUUID();
            return {
                record: {
                    id: jobId,
                    domainId: evaluation.domainId,
                    jobType: 'deploy' as const,
                    priority: 3,
                    payload: {
                        domain: evaluation.domain,
                        triggerBuild,
                        addCustomDomain,
                        cloudflareAccount: evaluation.cloudflareAccount ?? null,
                    },
                    status: 'pending' as const,
                    scheduledFor: new Date(),
                    maxAttempts: 3,
                },
                meta: { domainId: evaluation.domainId, domain: evaluation.domain, jobId },
            };
        });

        // Perform atomic bulk insert within a transaction
        const jobs: Array<{ domainId: string; domain: string; jobId: string }> = [];

        await db.transaction(async (tx) => {
            // Single bulk insert for all jobs
            await enqueueContentJobs(jobRecords.map(j => j.record), tx);

            // Populate jobs array after successful insert
            for (const j of jobRecords) {
                jobs.push(j.meta);
            }
        });

        const jobIds = jobs.map((job) => job.jobId);
        let requeueWarning: string | undefined;
        try {
            await requeueContentJobIds(jobIds);
        } catch (requeueError) {
            requeueWarning = 'Jobs persisted but requeue notification failed; jobs will be picked up by background reconciler';
            console.error('Bulk deploy requeue failed after commit:', {
                jobIds,
                error: requeueError instanceof Error ? requeueError.message : String(requeueError),
            });
        }

        return NextResponse.json({
            success: true,
            queued: jobs.length,
            queueable: eligibleDomains.length,
            blocked: blockedDomains.length,
            jobs,
            blockedDomains,
            preflightWarnings,
            ...(requeueWarning && { warning: requeueWarning }),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        console.error('Bulk deploy failed:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to queue bulk deployment' }, { status: 500 });
    }
}
