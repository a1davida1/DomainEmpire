import { NextRequest, NextResponse } from 'next/server';
import { login, seedAdminIfNeeded } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!password) {
            return NextResponse.json(
                { error: 'Password is required' },
                { status: 400 }
            );
        }

        // Migration path: seed admin user from ADMIN_PASSWORD if no users exist
        await seedAdminIfNeeded();

        // Support legacy single-password login by using default admin email
        const loginEmail = email || process.env.ADMIN_EMAIL || 'admin@domainempire.local';
        const user = await login(loginEmail, password);

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        return NextResponse.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
