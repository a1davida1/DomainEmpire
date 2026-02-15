import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: vi.fn(),
    },
    articles: {
        createdAt: 'created_at',
        deletedAt: 'deleted_at',
        domainId: 'domain_id',
    },
    domains: { id: 'id', domain: 'domain' },
    keywords: {
        domainId: 'domain_id',
        articleId: 'article_id',
        monthlyVolume: 'monthly_volume',
        difficulty: 'difficulty',
    },
}));

const { GET } = await import('@/app/api/content/calendar/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('content/calendar route validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
    });

    it('rejects invalid strategy', async () => {
        const response = await GET(makeGetRequest('http://localhost/api/content/calendar?strategy=invalid'));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid strategy');
    });
});
