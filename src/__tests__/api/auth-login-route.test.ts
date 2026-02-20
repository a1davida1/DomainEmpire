import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockLogin = vi.fn();
const mockSeedAdminIfNeeded = vi.fn();
const mockLoginLimiter = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock('@/lib/auth', () => ({
    login: mockLogin,
    seedAdminIfNeeded: mockSeedAdminIfNeeded,
}));

vi.mock('@/lib/rate-limit', () => ({
    loginLimiter: mockLoginLimiter,
    getClientIp: mockGetClientIp,
}));

const { POST } = await import('@/app/api/auth/login/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('POST /api/auth/login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClientIp.mockReturnValue('127.0.0.1');
        mockLoginLimiter.mockReturnValue({ allowed: true, headers: {} });
        mockSeedAdminIfNeeded.mockResolvedValue(undefined);
    });

    it('accepts missing email and falls back to ADMIN_EMAIL', async () => {
        mockLogin.mockResolvedValue({
            id: 'user-1',
            name: 'Admin',
            email: 'admin@domainempire.local',
            role: 'admin',
        });

        const response = await POST(makeRequest({ password: 'secret' }));

        expect(response.status).toBe(200);
        expect(mockSeedAdminIfNeeded).toHaveBeenCalledTimes(1);
        expect(mockLogin).toHaveBeenCalledTimes(1);
        expect(mockLogin.mock.calls[0][0]).toEqual(expect.any(String));
        expect(mockLogin.mock.calls[0][1]).toBe('secret');
    });

    it('rejects non-string email payloads', async () => {
        const response = await POST(makeRequest({ email: 123, password: 'secret' }));

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Email must be a string');
        expect(mockLogin).not.toHaveBeenCalled();
    });
});
