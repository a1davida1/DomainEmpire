import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockMediaModerationEventsTable = {
    id: 'id',
    userId: 'user_id',
    taskId: 'task_id',
    assetId: 'asset_id',
    createdAt: 'created_at',
};

let eventRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    asc: vi.fn((arg: unknown) => ({ type: 'asc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
    },
    mediaModerationEvents: mockMediaModerationEventsTable,
}));

const { GET } = await import('@/app/api/growth/media-review/events/export/route');

function makeRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('growth media-review/events/export route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        eventRows = [];

        mockFrom.mockImplementation(() => ({
            where: () => ({
                orderBy: async () => eventRows,
            }),
        }));
    });

    it('returns JSON export with chain metadata', async () => {
        const taskId = '11111111-1111-4111-8111-111111111111';
        const assetId = '22222222-2222-4222-8222-222222222222';
        eventRows = [
            {
                id: 'evt-1',
                userId: 'user-1',
                taskId,
                assetId,
                actorId: 'user-1',
                eventType: 'created',
                payload: { status: 'pending' },
                prevEventHash: null,
                eventHash: 'abc123',
                createdAt: new Date('2026-02-15T00:00:00Z'),
            },
        ];

        const response = await GET(makeRequest('http://localhost/api/growth/media-review/events/export?format=json'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.count).toBe(1);
        expect(body.chain).toBeDefined();
        expect(Array.isArray(body.events)).toBe(true);
    });
});
