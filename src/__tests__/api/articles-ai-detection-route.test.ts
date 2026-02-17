import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockAiLimiter = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/rate-limit', () => ({
    aiLimiter: mockAiLimiter,
    getClientIp: mockGetClientIp,
}));

vi.mock('@/lib/db', () => ({
    db: {},
    articles: {},
    apiCallLogs: {},
}));

vi.mock('@/lib/ai/ai-detection', () => ({
    checkAIDetection: vi.fn(),
    isAIDetectionEnabled: vi.fn(() => true),
}));

const { POST } = await import('../../app/api/articles/[id]/ai-detection/route');

function makeRequest(headers?: HeadersInit): NextRequest {
    return {
        headers: new Headers(headers),
    } as unknown as NextRequest;
}

describe('POST /api/articles/[id]/ai-detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetClientIp.mockReturnValue('127.0.0.1');
        mockAiLimiter.mockReturnValue({ allowed: true, headers: {} });
    });

    it('returns 403 when CSRF header is missing', async () => {
        const response = await POST(
            makeRequest(),
            { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) },
        );

        expect(response.status).toBe(403);
        expect(mockAiLimiter).not.toHaveBeenCalled();

        const body = await response.json();
        expect(body.error).toContain('CSRF validation failed');
    });

    it('allows request to proceed past CSRF gate when header is present', async () => {
        mockAiLimiter.mockReturnValueOnce({ allowed: false, headers: {} });

        const response = await POST(
            makeRequest({ 'x-requested-with': 'XMLHttpRequest' }),
            { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) },
        );

        expect(response.status).toBe(429);
        expect(mockAiLimiter).toHaveBeenCalledWith('127.0.0.1');
    });
});
