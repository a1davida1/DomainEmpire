import { NextRequest, NextResponse } from 'next/server';
import { db, monetizationProfiles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/monetization/affiliates - Get affiliate programs for a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');

    if (!domainId) {
        return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
    }

    try {
        const profile = await db.query.monetizationProfiles.findFirst({
            where: eq(monetizationProfiles.domainId, domainId),
        });

        return NextResponse.json({ affiliates: profile?.affiliates || [] });
    } catch (error) {
        console.error('Failed to fetch affiliates:', error);
        return NextResponse.json({ error: 'Failed to fetch affiliates' }, { status: 500 });
    }
}

// POST /api/monetization/affiliates - Add or update an affiliate program
// POST /api/monetization/affiliates - Update affiliate programs list
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const domainId = typeof body.domainId === 'string' ? body.domainId : '';
        const affiliates = Array.isArray(body.affiliates) ? body.affiliates : null;

        if (!domainId || !affiliates) {
            return NextResponse.json({ error: 'Domain ID and affiliates array required' }, { status: 400 });
        }

        // Get existing profile or create one
        const profile = await db.query.monetizationProfiles.findFirst({
            where: eq(monetizationProfiles.domainId, domainId),
        });

        if (!profile) {
            // Create new profile
            await db.insert(monetizationProfiles).values({
                domainId,
                affiliates,
            });
        } else {
            // Update existing profile
            await db.update(monetizationProfiles)
                .set({ affiliates, updatedAt: new Date() })
                .where(eq(monetizationProfiles.domainId, domainId));
        }

        return NextResponse.json({ success: true, newAffiliates: affiliates });

    } catch (error) {
        console.error('Failed to update affiliates:', error);
        return NextResponse.json({ error: 'Failed to update affiliates' }, { status: 500 });
    }
}
