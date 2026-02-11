/**
 * Auth module re-export for backward compatibility.
 * All auth logic now lives in @/lib/auth/index.ts
 */
export {
    verifyAuth,
    requireAuth,
    requireRole,
    clearAuthCookie,
    login,
    logout,
    getAuthUser,
    getRequestUser,
    createUser,
    getUserById,
    seedAdminIfNeeded,
    purgeExpiredSessions,
    hashPassword,
    verifyPassword,
} from '@/lib/auth/index';

export type { AuthUser } from '@/lib/auth/index';
