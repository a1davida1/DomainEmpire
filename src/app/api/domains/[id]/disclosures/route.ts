import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDisclosureConfig, updateDisclosureConfig } from '@/lib/disclosures';

// GET /api/domains/[id]/disclosures
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const config = await getDisclosureConfig(params.id);
    return NextResponse.json(config);
}

// PUT /api/domains/[id]/disclosures — update disclosure config
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        await updateDisclosureConfig(params.id, body);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update disclosure config:', error);
        return NextResponse.json({ error: 'Failed to update disclosure config' }, { status: 500 });
    }
}
