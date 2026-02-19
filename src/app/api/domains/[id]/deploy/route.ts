import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { type DeployPreflightResult, runDeployPreflight } from '@/lib/deploy/preflight';

const deploySchema = z.object({
    triggerBuild: z.boolean().default(true),
    addCustomDomain: z.boolean().default(false),
});

interface PageProps {
    params: Promise<{ id: string }>;
}

// POST /api/domains/[id]/deploy - Deploy domain site
export async function POST(request: NextRequest, { params }: PageProps) {
    const cached = await checkIdempotencyKey(request);
    if (cached) return cached;

    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid domain ID format' }, { status: 400 });
    }

    try {
        // Parse JSON with error handling for malformed JSON
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const options = deploySchema.parse(body);

        const domainResult = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                niche: domains.niche,
                registrar: domains.registrar,
                cloudflareAccount: domains.cloudflareAccount,
            })
            .from(domains)
            .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const domain = domainResult[0];

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        let preflight: DeployPreflightResult;
        try {
            preflight = await runDeployPreflight({
                domain: domain.domain,
                registrar: domain.registrar,
                addCustomDomain: options.addCustomDomain,
                cloudflareAccount: domain.cloudflareAccount ?? null,
                domainNiche: domain.niche ?? null,
            });
        } catch (preflightError) {
            const message = preflightError instanceof Error ? preflightError.message : 'Unknown preflight error';
            console.error('Deploy preflight failed:', {
                domainId: id,
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

        const blockingIssues = preflight.issues.filter((issue) => issue.severity === 'blocking');
        if (blockingIssues.length > 0 || !preflight.ok) {
            return NextResponse.json(
                {
                    error: 'Deployment preflight failed',
                    issues: blockingIssues,
                },
                { status: 400 },
            );
        }

        // Enqueue deploy job.  The partial unique index
        // (content_queue_deploy_once_uidx) ensures at most one pending/processing
        // deploy per domain — this replaces the old racy SELECT-then-INSERT check.
        const jobId = randomUUID();
        try {
            await enqueueContentJob({
                id: jobId,
                domainId: id,
                jobType: 'deploy',
                priority: 2,
                payload: {
                    domain: domain.domain,
                    triggerBuild: options.triggerBuild,
                    addCustomDomain: options.addCustomDomain,
                    cloudflareAccount: domain.cloudflareAccount ?? null,
                },
                status: 'pending',
                scheduledFor: new Date(),
                maxAttempts: 3,
            });
        } catch (enqueueErr: unknown) {
            // Postgres error 23505 = unique_violation from the deploy_once partial index
            if (enqueueErr instanceof Error && 'code' in enqueueErr && (enqueueErr as { code: string }).code === '23505') {
                return NextResponse.json(
                    { error: 'A deployment is already in progress for this domain' },
                    { status: 409 },
                );
            }
            throw enqueueErr;
        }

        const response = NextResponse.json({
            success: true,
            jobId,
            domain: domain.domain,
            message: 'Deployment queued',
            preflightWarnings: preflight.issues.filter((issue) => issue.severity === 'warning'),
        });
        await storeIdempotencyResult(request, response);
        return response;
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Deploy failed:', error);
        return NextResponse.json({ error: 'Failed to queue deployment' }, { status: 500 });
    }
}

// GET /api/domains/[id]/deploy - Get deployment status
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const domainResult = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                isDeployed: domains.isDeployed,
                cloudflareProject: domains.cloudflareProject,
                lastDeployedAt: domains.lastDeployedAt,
            })
            .from(domains)
            .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const domain = domainResult[0];

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        return NextResponse.json({
            domain: domain.domain,
            isDeployed: domain.isDeployed,
            cloudflareProject: domain.cloudflareProject,
            lastDeployedAt: domain.lastDeployedAt,
        });
    } catch (error) {
        console.error('Get deploy status failed:', error);
        return NextResponse.json({ error: 'Failed to get deployment status' }, { status: 500 });
    }
}
