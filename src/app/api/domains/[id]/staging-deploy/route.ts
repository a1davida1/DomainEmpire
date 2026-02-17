import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { processStagingDeploy } from '@/lib/deploy/processor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/domains/[id]/staging-deploy
 * Triggers a staging branch deploy on CF Pages for the given domain.
 * Returns a staging preview URL without touching DNS or custom domains.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid domain ID' }, { status: 400 });
    }

    try {
        const result = await processStagingDeploy(id);

        if (!result.success) {
            console.error('[staging-deploy] processStagingDeploy failed', {
                domainId: id,
                error: result.error,
                result,
            });
            return NextResponse.json(
                { error: 'Staging deploy failed', code: 'STAGING_DEPLOY_FAILED' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            stagingUrl: result.stagingUrl,
            cfProject: result.cfProject,
            fileCount: result.fileCount,
        });
    } catch (error) {
        console.error('[staging-deploy] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
