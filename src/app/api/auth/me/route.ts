import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

// GET /api/auth/me — return current authenticated user info
export async function GET() {
    const user = await getAuthUser();

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        expertise: user.expertise,
        credentials: user.credentials,
    });
}
