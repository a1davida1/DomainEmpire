import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { snapshotCompliance } from '@/lib/compliance/metrics';

// POST /api/compliance/snapshot — trigger a compliance snapshot
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    let body;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            body = await request.json();
        } catch (error_) {
            console.error('Compliance snapshot JSON parse error:', error_);
            return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
        }
    } else {
        body = {};
    }

    let domainId: string | undefined = undefined;

    // Explicit validation: only set domainId if strictly present (not strictly null/undefined)
    if (body.domainId !== null && body.domainId !== undefined) {
        // Validate as UUID string
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof body.domainId !== 'string' || !uuidRegex.test(body.domainId)) {
            return NextResponse.json({ error: 'Invalid domainId format. Expected UUID.' }, { status: 400 });
        }
        domainId = body.domainId;
    }

    try {
        await snapshotCompliance(domainId);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Compliance snapshot failed:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to trigger compliance snapshot'
        }, { status: 500 });
    }
}
