import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';
import { type DeployPreflightResult, runDeployPreflight } from '@/lib/deploy/preflight';
import { deployDomainInline } from '@/lib/deploy/processor';

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

    const authError = await requireRole(request, 'admin');
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

        // Run deploy inline — no queue wait, instant execution
        const result = await deployDomainInline({
            domainId: id,
            domain: domain.domain,
            triggerBuild: options.triggerBuild,
            addCustomDomain: options.addCustomDomain,
            cloudflareAccount: domain.cloudflareAccount ?? null,
        });

        const response = NextResponse.json({
            success: result.success,
            jobId: result.jobId,
            domain: domain.domain,
            message: result.success ? 'Deployed successfully' : `Deploy failed: ${result.error}`,
            steps: result.steps,
            cfProject: result.cfProject,
            fileCount: result.fileCount,
            dnsVerified: result.dnsVerified,
            durationMs: result.durationMs,
            preflightWarnings: preflight.issues.filter((issue) => issue.severity === 'warning'),
        }, { status: result.success ? 200 : 500 });
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
