import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockCaptureSubscriber = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockGetClientIp = vi.fn();

let limiterResponse: { allowed: boolean; headers: Record<string, string> } = { allowed: true, headers: {} };

vi.mock('@/lib/subscribers', () => ({
    captureSubscriber: mockCaptureSubscriber,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: mockGetClientIp,
}));

mockCreateRateLimiter.mockImplementation(() => () => limiterResponse);
mockGetClientIp.mockReturnValue('127.0.0.1');

const { POST } = await import('@/app/api/capture/route');

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
    return {
        headers: new Headers(headers),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('capture route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        limiterResponse = { allowed: true, headers: {} };
        mockCreateRateLimiter.mockImplementation(() => () => limiterResponse);
        mockGetClientIp.mockReturnValue('127.0.0.1');
        mockCaptureSubscriber.mockResolvedValue({ id: 'subscriber-1' });
    });

    it('captures subscriber and infers campaign attribution from UTM referrer', async () => {
        const response = await POST(makeRequest({
            domainId: '44444444-4444-4444-8444-444444444444',
            email: 'test@example.com',
            source: 'lead_form',
        }, {
            referer: 'https://landing.example/?utm_source=pinterest&utm_medium=pin&utm_campaign=33333333-3333-4333-8333-333333333333&utm_content=v1',
            'user-agent': 'Vitest',
        }));

        expect(response.status).toBe(201);
        expect(mockCaptureSubscriber).toHaveBeenCalledWith(expect.objectContaining({
            domainId: '44444444-4444-4444-8444-444444444444',
            email: 'test@example.com',
            sourceCampaignId: '33333333-3333-4333-8333-333333333333',
            originalUtm: expect.objectContaining({
                utm_source: 'pinterest',
                utm_medium: 'pin',
                utm_campaign: '33333333-3333-4333-8333-333333333333',
                utm_content: 'v1',
            }),
        }));
    });

    it('returns 400 for invalid input', async () => {
        const response = await POST(makeRequest({
            domainId: 'not-a-uuid',
            email: 'invalid',
        }));

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid input');
        expect(mockCaptureSubscriber).not.toHaveBeenCalled();
    });

    it('short-circuits when honeypot field is filled', async () => {
        const response = await POST(makeRequest({
            domainId: '44444444-4444-4444-8444-444444444444',
            email: 'test@example.com',
            lead_hp_field: 'bot',
        }));

        expect(response.status).toBe(201);
        expect(mockCaptureSubscriber).not.toHaveBeenCalled();
    });
});
