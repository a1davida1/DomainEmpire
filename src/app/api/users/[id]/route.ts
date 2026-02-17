import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireRole, getRequestUser, hashPassword } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// PATCH /api/users/[id] — update user (admin only)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const body = await request.json();
        const { name, role, expertise, credentials, isActive, password } = body;

        const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, params.id)).limit(1);
        if (!existing.length) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) {
            if (typeof name !== 'string') {
                return NextResponse.json({ error: 'Name must be a string' }, { status: 400 });
            }
            updates.name = name.trim();
        }
        if (role !== undefined) {
            const validRoles = ['admin', 'editor', 'reviewer', 'expert'];
            if (!validRoles.includes(role)) {
                return NextResponse.json(
                    { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                    { status: 400 }
                );
            }
            updates.role = role;
        }
        if (expertise !== undefined) updates.expertise = expertise;
        if (credentials !== undefined) updates.credentials = credentials;
        if (isActive !== undefined) updates.isActive = isActive;
        if (password) {
            if (password.length < 8) {
                return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
            }
            updates.passwordHash = await hashPassword(password);
        }

        await db.update(users).set(updates).where(eq(users.id, params.id));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update user:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

// DELETE /api/users/[id] — deactivate user (admin only, cannot deactivate self)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const currentUser = getRequestUser(request);
    if (currentUser.id === params.id) {
        return NextResponse.json(
            { error: 'Cannot deactivate your own account' },
            { status: 400 }
        );
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, params.id)).limit(1);
    if (!existing.length) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, params.id));

    return NextResponse.json({ success: true });
}
