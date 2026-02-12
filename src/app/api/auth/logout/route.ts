import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
    await clearAuthCookie();
    return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
        { status: 303 }
    );
}

// GET logout removed — GET mutations are vulnerable to CSRF
// (an attacker can log users out by embedding <img src="/api/auth/logout">)
