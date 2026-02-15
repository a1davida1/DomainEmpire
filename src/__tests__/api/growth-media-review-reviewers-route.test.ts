import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockUsersTable = {
    id: 'id',
    name: 'name',
    role: 'role',
    isActive: 'is_active',
};

const mockMediaModerationTasksTable = {
    reviewerId: 'reviewer_id',
    userId: 'user_id',
    status: 'status',
};

let reviewerRows: Array<Record<string, unknown>> = [];
let pendingRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    asc: vi.fn((arg: unknown) => ({ type: 'asc', arg })),
    count: vi.fn(() => ({ type: 'count' })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
    },
    users: mockUsersTable,
    mediaModerationTasks: mockMediaModerationTasksTable,
}));

const { GET } = await import('@/app/api/growth/media-review/reviewers/route');

function makeRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('growth media-review/reviewers route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({
            id: '11111111-1111-4111-8111-111111111111',
            role: 'reviewer',
            name: 'Reviewer One',
        });
        mockIsFeatureEnabled.mockReturnValue(true);

        reviewerRows = [];
        pendingRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockUsersTable) {
                return {
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => reviewerRows,
                        }),
                    }),
                };
            }
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => ({
                        groupBy: async () => pendingRows,
                    }),
                };
            }
            return {
                where: () => ({
                    groupBy: async () => [],
                }),
            };
        });
    });

    it('returns reviewers with pending workload counts', async () => {
        reviewerRows = [
            {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                name: 'Alice Reviewer',
                role: 'reviewer',
            },
            {
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                name: 'Bob Expert',
                role: 'expert',
            },
        ];

        pendingRows = [
            { reviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', taskCount: 2 },
            { reviewerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', taskCount: 1 },
        ];

        const response = await GET(makeRequest('http://localhost/api/growth/media-review/reviewers?limit=20'));
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.count).toBe(2);
        expect(body.reviewers).toEqual([
            expect.objectContaining({
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                pendingTasks: 1,
            }),
            expect.objectContaining({
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                pendingTasks: 2,
            }),
        ]);
    });

    it('returns empty list when no reviewers exist', async () => {
        reviewerRows = [];

        const response = await GET(makeRequest('http://localhost/api/growth/media-review/reviewers'));
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.count).toBe(0);
        expect(body.reviewers).toEqual([]);
    });
});
