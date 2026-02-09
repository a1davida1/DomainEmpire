import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'domain-empire-auth';

/**
 * Simple password-based authentication for single operator
 * Not for multi-user - just protects the dashboard
 */

export async function verifyAuth(): Promise<boolean> {
    const cookieStore = await cookies();
    const authToken = cookieStore.get(AUTH_COOKIE_NAME);

    if (!authToken) {
        return false;
    }

    // Token is a simple hash of the password + secret
    const expectedToken = hashPassword(process.env.ADMIN_PASSWORD || '');
    return authToken.value === expectedToken;
}

export function hashPassword(password: string): string {
    // Simple hash for session token - not for storing passwords
    const crypto = require('crypto');
    const secret = process.env.AUTH_SECRET || 'fallback-secret-change-me';
    return crypto.createHmac('sha256', secret).update(password).digest('hex');
}

export async function createAuthCookie(password: string): Promise<boolean> {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        throw new Error('ADMIN_PASSWORD environment variable is not set');
    }

    if (password !== adminPassword) {
        return false;
    }

    const cookieStore = await cookies();
    const token = hashPassword(password);

    cookieStore.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
    });

    return true;
}

export async function clearAuthCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Middleware helper to protect API routes
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
    const isAuthenticated = await verifyAuth();

    if (!isAuthenticated) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    return null; // null means auth passed
}
