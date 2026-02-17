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
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const email = typeof body.email === 'string' ? body.email : '';
        const name = typeof body.name === 'string' ? body.name : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const role = typeof body.role === 'string' ? body.role : '';
        let expertise: string[] = [];
        if (Array.isArray(body.expertise)) {
            const hasInvalidExpertise = body.expertise.some((item) => typeof item !== 'string');
            if (hasInvalidExpertise) {
                return NextResponse.json(
                    { error: 'expertise must be an array of strings' },
                    { status: 400 }
                );
            }
            expertise = body.expertise
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
        }
        const credentials = typeof body.credentials === 'string' ? body.credentials : undefined;

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

        const validRoles = ['admin', 'editor', 'reviewer', 'expert'] as const;
        if (role && !validRoles.includes(role as typeof validRoles[number])) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            );
        }

        const userId = await createUser({
            email,
            name,
            password,
            role: (role || 'editor') as typeof validRoles[number],
            expertise,
            credentials,
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
