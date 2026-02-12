import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { restoreDomain } from '@/lib/db/soft-delete';

// POST /api/domains/[id]/restore - Restore a soft-deleted domain
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const { id } = await params;
        const { domain } = await restoreDomain(id);

        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: `Domain ${domain} restored` });
    } catch (error) {
        console.error('Failed to restore domain:', error);
        return NextResponse.json({ error: 'Failed to restore domain' }, { status: 500 });
    }
}
