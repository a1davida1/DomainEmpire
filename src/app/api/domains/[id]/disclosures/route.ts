import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDisclosureConfig, updateDisclosureConfig } from '@/lib/disclosures';
import { z } from 'zod';

const disclosureUpdateSchema = z.object({
    affiliateDisclosure: z.string().max(2000).optional(),
    adDisclosure: z.string().max(2000).optional().nullable(),
    notAdviceDisclaimer: z.string().max(2000).optional(),
    howWeMoneyPage: z.string().max(500).optional().nullable(),
    editorialPolicyPage: z.string().max(500).optional().nullable(),
    aboutPage: z.string().max(500).optional().nullable(),
    showReviewedBy: z.boolean().optional(),
    showLastUpdated: z.boolean().optional(),
    showChangeLog: z.boolean().optional(),
    showMethodology: z.boolean().optional(),
}).strict();

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
        const parsed = disclosureUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid disclosure config', details: parsed.error.issues },
                { status: 400 }
            );
        }
        await updateDisclosureConfig(params.id, parsed.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update disclosure config:', error);
        return NextResponse.json({ error: 'Failed to update disclosure config' }, { status: 500 });
    }
}
