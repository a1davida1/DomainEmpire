import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { approvalPolicies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/review/policies — list all policies
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const policies = await db.select().from(approvalPolicies);
    return NextResponse.json(policies);
}

// POST /api/review/policies — create or update a policy
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const body = await request.json();
        const { domainId, contentType, ymylLevel, requiredRole, requiresQaChecklist, requiresExpertSignoff, autoPublish } = body;

        if (!ymylLevel) {
            return NextResponse.json({ error: 'ymylLevel is required' }, { status: 400 });
        }

        const [policy] = await db.insert(approvalPolicies).values({
            domainId: domainId || null,
            contentType: contentType || null,
            ymylLevel,
            requiredRole: requiredRole || 'reviewer',
            requiresQaChecklist: requiresQaChecklist ?? true,
            requiresExpertSignoff: requiresExpertSignoff ?? false,
            autoPublish: autoPublish ?? false,
        }).returning();

        return NextResponse.json(policy, { status: 201 });
    } catch (error) {
        console.error('Failed to create policy:', error);
        return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 });
    }
}

// DELETE /api/review/policies — delete a policy by id
export async function DELETE(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Policy id is required' }, { status: 400 });
    }

    try {
        // In Drizzle for Postgres, using .returning() allows us to see exactly what was deleted.
        const deleted = await db.delete(approvalPolicies).where(eq(approvalPolicies.id, id)).returning();

        if (deleted.length === 0) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete policy:', error);
        return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500 });
    }
}
