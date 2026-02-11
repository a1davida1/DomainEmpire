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
