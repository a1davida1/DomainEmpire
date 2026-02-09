import { NextRequest, NextResponse } from 'next/server';
import { db, domains, contentQueue } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const deploySchema = z.object({
    createRepo: z.boolean().default(true),
    triggerBuild: z.boolean().default(true),
    addCustomDomain: z.boolean().default(false),
});

interface PageProps {
    params: Promise<{ id: string }>;
}

// POST /api/domains/[id]/deploy - Deploy domain site
export async function POST(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

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
            .select()
            .from(domains)
            .where(eq(domains.id, id))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const domain = domainResult[0];

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        const jobId = randomUUID();
        await db.insert(contentQueue).values({
            id: jobId,
            domainId: id,
            jobType: 'deploy',
            priority: 2,
            payload: {
                domain: domain.domain,
                createRepo: options.createRepo,
                triggerBuild: options.triggerBuild,
                addCustomDomain: options.addCustomDomain,
            },
            status: 'pending',
            scheduledFor: new Date(),
            maxAttempts: 3,
        });

        return NextResponse.json({
            success: true,
            jobId,
            domain: domain.domain,
            message: 'Deployment queued',
        });
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
            .select()
            .from(domains)
            .where(eq(domains.id, id))
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
            githubRepo: domain.githubRepo,
            cloudflareProject: domain.cloudflareProject,
            lastDeployedAt: domain.lastDeployedAt,
        });
    } catch (error) {
        console.error('Get deploy status failed:', error);
        return NextResponse.json({ error: 'Failed to get deployment status' }, { status: 500 });
    }
}
