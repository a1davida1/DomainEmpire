import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireRole, createUser } from '@/lib/auth';
import { desc } from 'drizzle-orm';

// GET /api/users — list all users (admin only)
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const allUsers = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        expertise: users.expertise,
        credentials: users.credentials,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));

    return NextResponse.json({ users: allUsers });
}

// POST /api/users — create a new user (admin only)
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const body = await request.json();
        const { email, name, password, role, expertise, credentials } = body;

        if (!email || !name || !password) {
            return NextResponse.json(
                { error: 'Email, name, and password are required' },
                { status: 400 }
            );
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 }
            );
        }

        const validRoles = ['admin', 'editor', 'reviewer', 'expert'];
        if (role && !validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            );
        }

        const userId = await createUser({
            email,
            name,
            password,
            role: role || 'editor',
            expertise: expertise || [],
            credentials: credentials || undefined,
        });

        return NextResponse.json({ id: userId }, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('unique')) {
            return NextResponse.json(
                { error: 'A user with this email already exists' },
                { status: 409 }
            );
        }
        console.error('Failed to create user:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}
