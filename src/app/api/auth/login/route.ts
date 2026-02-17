import { NextRequest, NextResponse } from 'next/server';
import { login, seedAdminIfNeeded } from '@/lib/auth';
import { loginLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    // Rate limit: 5 attempts per 15 minutes per IP
    const ip = getClientIp(request);

    if (ip === 'unknown') {
        console.warn(`[Auth] Login attempt with undetectable IP. UserAgent: ${request.headers.get('user-agent') || 'missing'}`);
    }

    let limit;
    try {
        limit = loginLimiter(ip);
    } catch (e) {
        console.error('Rate limiter failed:', e);
        limit = { allowed: true, headers: {} };
    }

    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many login attempts. Please try again later.' },
            { status: 429, headers: limit.headers }
        );
    }

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        if (typeof body.email !== 'string') {
            return NextResponse.json(
                { error: 'Email must be a string' },
                { status: 400 }
            );
        }

        if (typeof body.password !== 'string') {
            return NextResponse.json(
                { error: 'Password must be a string' },
                { status: 400 }
            );
        }

        const email = body.email;
        const password = body.password;

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
        }, { headers: limit.headers });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
