import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { values: mockValues };
        },
    },
    reviewTasks: {
        id: 'id',
        taskType: 'task_type',
        entityId: 'entity_id',
        domainId: 'domain_id',
        articleId: 'article_id',
        domainResearchId: 'domain_research_id',
        checklistJson: 'checklist_json',
        status: 'status',
        reviewerId: 'reviewer_id',
        reviewedAt: 'reviewed_at',
        reviewNotes: 'review_notes',
        createdBy: 'created_by',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
}));

const { GET, POST } = await import('@/app/api/review/tasks/route');

function makeGetRequest(url: string): NextRequest {
    return {
        url,
        headers: new Headers(),
    } as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
    } as unknown as NextRequest;
}

describe('review tasks route', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockRequireAuth.mockResolvedValue(null);
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'reviewer-1', role: 'reviewer', name: 'Reviewer' });

        mockLimit.mockResolvedValue([]);
        mockOrderBy.mockReturnValue({ limit: mockLimit });
        mockWhere.mockReturnValue({ orderBy: mockOrderBy });
        mockFrom.mockReturnValue({
            where: mockWhere,
            orderBy: mockOrderBy,
        });

        mockReturning.mockResolvedValue([]);
        mockValues.mockReturnValue({ returning: mockReturning });
    });

    it('lists tasks with filters', async () => {
        mockLimit.mockResolvedValueOnce([{
            id: 'task-1',
            taskType: 'domain_buy',
            status: 'pending',
            domainResearchId: 'research-1',
        }]);

        const response = await GET(makeGetRequest('http://localhost/api/review/tasks?status=pending&taskType=domain_buy&limit=10'));
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.count).toBe(1);
        expect(body.tasks[0].id).toBe('task-1');
    });

    it('creates a domain_buy review task', async () => {
        mockReturning.mockResolvedValueOnce([{
            id: 'task-1',
            taskType: 'domain_buy',
            status: 'pending',
            entityId: '11111111-1111-4111-8111-111111111111',
            domainResearchId: '11111111-1111-4111-8111-111111111111',
        }]);

        const response = await POST(makePostRequest({
            taskType: 'domain_buy',
            domainResearchId: '11111111-1111-4111-8111-111111111111',
            entityId: '11111111-1111-4111-8111-111111111111',
            checklistJson: { underwritingReviewed: false },
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(mockInsert).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
            taskType: 'domain_buy',
            entityId: '11111111-1111-4111-8111-111111111111',
            domainResearchId: '11111111-1111-4111-8111-111111111111',
            status: 'pending',
        }));
    });

    it('rejects invalid task payload', async () => {
        const response = await POST(makePostRequest({
            taskType: 'domain_buy',
        }));

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Validation failed');
    });
});
