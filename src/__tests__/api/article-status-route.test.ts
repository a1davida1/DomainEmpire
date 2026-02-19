import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockCanTransition = vi.fn();
const mockGetApprovalPolicy = vi.fn();
const mockParseStructuredRationale = vi.fn();
const mockRequiresStructuredRationale = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/review/workflow', () => ({
    canTransition: mockCanTransition,
    getApprovalPolicy: mockGetApprovalPolicy,
}));

vi.mock('@/lib/review/rationale-policy', () => ({
    parseStructuredRationale: mockParseStructuredRationale,
    requiresStructuredRationale: mockRequiresStructuredRationale,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
    and: vi.fn((...args: unknown[]) => args),
    desc: vi.fn((arg: unknown) => arg),
}));

vi.mock('@/lib/db', () => ({
    db: {
        query: {
            articles: {
                findFirst: (...args: unknown[]) => mockFindFirst(...args),
            },
        },
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(async () => []),
                    })),
                })),
            })),
        })),
        update: () => ({
            set: () => ({
                where: vi.fn(),
            }),
        }),
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
            await fn({
                update: () => ({ set: () => ({ where: vi.fn() }) }),
                insert: () => ({ values: vi.fn() }),
            });
        }),
    },
}));

vi.mock('@/lib/db/schema', () => ({
    articles: { id: 'id' },
    reviewTasks: {
        id: 'id',
        reviewerId: 'reviewerId',
        taskType: 'taskType',
        status: 'status',
        articleId: 'articleId',
        createdAt: 'createdAt',
    },
    reviewEvents: {
        $inferInsert: { eventType: 'string' },
    },
}));

const { POST } = await import('../../app/api/articles/[id]/status/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('POST /api/articles/[id]/status quality gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'u1', role: 'reviewer' });
        mockCanTransition.mockResolvedValue({ allowed: true });
        mockGetApprovalPolicy.mockResolvedValue({ autoPublish: false });
        mockParseStructuredRationale.mockReturnValue({ ok: true, parsed: {} });
        mockRequiresStructuredRationale.mockReturnValue(true);
    });

    it('blocks review->approved when content quality is too low', async () => {
        mockFindFirst.mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000001',
            domainId: '00000000-0000-4000-8000-000000000002',
            ymylLevel: 'none',
            status: 'review',
            contentType: 'article',
            contentMarkdown: 'Short content only.',
            contentHtml: null,
        });

        const res = await POST(makeRequest({ status: 'approved', rationale: 'looks good' }), {
            params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('Content quality gate failed');
    });
});
