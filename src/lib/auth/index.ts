/**
 * Multi-user session-based authentication.
 *
 * Replaces the old single-operator HMAC auth.
 * Uses scrypt for password hashing and DB-stored session tokens.
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { users, sessions } from '@/lib/db/schema';
import { eq, and, gt, lte } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './password';
import { createHash } from 'node:crypto';

export { hashPassword, verifyPassword };

const SESSION_COOKIE = 'de-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

export type AuthUser = {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'editor' | 'reviewer' | 'expert';
    expertise: string[];
    credentials: string | null;
};

// ─── User Management ────────────────────────────────────────

export async function createUser(opts: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'editor' | 'reviewer' | 'expert';
    expertise?: string[];
    credentials?: string;
}): Promise<string> {
    const passwordHash = await hashPassword(opts.password);

    const inserted = await db.insert(users).values({
        email: opts.email.toLowerCase().trim(),
        name: opts.name.trim(),
        passwordHash,
        role: opts.role || 'editor',
        expertise: opts.expertise || [],
        credentials: opts.credentials || null,
    }).returning({ id: users.id });

    if (inserted.length === 0) {
        throw new Error('User insert returned no rows');
    }
    return inserted[0].id;
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
    const result = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        expertise: users.expertise,
        credentials: users.credentials,
    }).from(users).where(and(eq(users.id, userId), eq(users.isActive, true))).limit(1);

    if (!result.length) return null;
    const u = result[0];
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as AuthUser['role'],
        expertise: (u.expertise || []) as string[],
        credentials: u.credentials,
    };
}

// ─── Session Management ─────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthUser | null> {
    const result = await db.select()
        .from(users)
        .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.isActive, true)))
        .limit(1);

    if (!result.length) return null;
    const user = result[0];

    // Migration path: if passwordHash looks like old HMAC format, check ADMIN_PASSWORD
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;

    // Create session
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

    await db.insert(sessions).values({
        userId: user.id,
        tokenHash,
        expiresAt,
    });

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
    });

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as AuthUser['role'],
        expertise: (user.expertise || []) as string[],
        credentials: user.credentials,
    };
}

export async function logout(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (token) {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    }

    cookieStore.delete(SESSION_COOKIE);
}

// ─── Auth Verification ──────────────────────────────────────

/**
 * Get the current authenticated user from session cookie.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const result = await db.select({
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
    }).from(sessions).where(
        and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()))
    ).limit(1);

    if (!result.length) return null;

    return getUserById(result[0].userId);
}

/**
 * Verify if the current request is authenticated.
 */
export async function verifyAuth(): Promise<boolean> {
    const user = await getAuthUser();
    return user !== null;
}

/**
 * Middleware helper for API routes.
 * Returns null if auth passes (with user ID set in header), or 401 response.
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
    const user = await getAuthUser();

    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // Attach user info to request headers for downstream use
    request.headers.set('x-user-id', user.id);
    request.headers.set('x-user-role', user.role);
    request.headers.set('x-user-name', user.name);

    return null; // null means auth passed
}

/**
 * Get the authenticated user from request headers (set by requireAuth).
 * Call this after requireAuth() has passed.
 */
export function getRequestUser(request: NextRequest): { id: string; role: string; name: string } {
    return {
        id: request.headers.get('x-user-id') || '',
        role: request.headers.get('x-user-role') || 'editor',
        name: request.headers.get('x-user-name') || '',
    };
}

/**
 * Require a specific role (or higher).
 * Role hierarchy: admin > expert > reviewer > editor
 */
export async function requireRole(
    request: NextRequest,
    minimumRole: 'editor' | 'reviewer' | 'expert' | 'admin'
): Promise<NextResponse | null> {
    const authResult = await requireAuth(request);
    if (authResult) return authResult;

    const roleHierarchy: Record<string, number> = {
        editor: 1,
        reviewer: 2,
        expert: 3,
        admin: 4,
    };

    const userRole = request.headers.get('x-user-role') || 'editor';
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;

    if (userLevel < requiredLevel) {
        return NextResponse.json(
            { error: 'Forbidden', message: `Requires ${minimumRole} role or higher` },
            { status: 403 }
        );
    }

    return null;
}

/**
 * Seed initial admin user from ADMIN_PASSWORD env var (migration path).
 * Called once during first login attempt if no users exist.
 */
export async function seedAdminIfNeeded(): Promise<void> {
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length > 0) return;

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) return;

    await createUser({
        email: process.env.ADMIN_EMAIL || 'admin@domainempire.local',
        name: 'Admin',
        password: adminPassword,
        role: 'admin',
    });

    console.log('[Auth] Seeded initial admin user from ADMIN_PASSWORD');
}

/**
 * Clean up expired sessions.
 */
export async function purgeExpiredSessions(): Promise<number> {
    const result = await db.delete(sessions)
        .where(lte(sessions.expiresAt, new Date()))
        .returning({ id: sessions.id });
    return result.length;
}

// Re-export for backward compatibility
export async function clearAuthCookie(): Promise<void> {
    return logout();
}
