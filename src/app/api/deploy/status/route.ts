import { NextRequest, NextResponse } from 'next/server';
import { db, contentQueue, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc } from 'drizzle-orm';

// GET /api/deploy/status - Fetch recent deployment jobs with step progress
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const jobs = await db
            .select({
                id: contentQueue.id,
                domainId: contentQueue.domainId,
                status: contentQueue.status,
                createdAt: contentQueue.createdAt,
                completedAt: contentQueue.completedAt,
                startedAt: contentQueue.startedAt,
                errorMessage: contentQueue.errorMessage,
                attempts: contentQueue.attempts,
                maxAttempts: contentQueue.maxAttempts,
                result: contentQueue.result,
                domainName: domains.domain,
            })
            .from(contentQueue)
            .leftJoin(domains, eq(contentQueue.domainId, domains.id))
            .where(eq(contentQueue.jobType, 'deploy'))
            .orderBy(desc(contentQueue.createdAt))
            .limit(20);

        return NextResponse.json({
            jobs: jobs.map(job => {
                const result = job.result as Record<string, unknown> | null;
                return {
                    id: job.id,
                    domain: job.domainName || 'Unknown Domain',
                    status: job.status,
                    createdAt: job.createdAt,
                    startedAt: job.startedAt,
                    completedAt: job.completedAt,
                    errorMessage: job.errorMessage,
                    attempts: job.attempts,
                    maxAttempts: job.maxAttempts,
                    // Include step progress from result
                    steps: result?.steps || null,
                    filesDeployed: result?.filesDeployed || null,
                    cfProject: result?.cfProject || null,
                };
            }),
        });

    } catch (error) {
        console.error('Failed to fetch deployment status:', error);
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}
