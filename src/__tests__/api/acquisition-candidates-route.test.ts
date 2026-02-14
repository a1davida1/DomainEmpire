import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockEnqueueContentJob = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockDomainResearchTable = {
    id: 'id',
    decision: 'decision',
    createdAt: 'created_at',
};

const mockAcquisitionEventsTable = {
    domainResearchId: 'domain_research_id',
    createdAt: 'created_at',
};

const mockContentQueueTable = {
    jobType: 'job_type',
    status: 'status',
    payload: 'payload',
};

let domainRows: Array<Record<string, unknown>> = [];
let eventRows: Array<Record<string, unknown>> = [];
let queueRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    enqueueContentJob: mockEnqueueContentJob,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    sql: Object.assign(
        ((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings: [...strings], values })) as unknown,
        { join: vi.fn((values: unknown[]) => ({ type: 'join', values })) },
    ),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
    },
    domainResearch: mockDomainResearchTable,
    acquisitionEvents: mockAcquisitionEventsTable,
    contentQueue: mockContentQueueTable,
}));

const { POST, GET } = await import('@/app/api/acquisition/candidates/route');

function makePostRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
        url: 'http://localhost/api/acquisition/candidates',
    } as unknown as NextRequest;
}

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('acquisition/candidates route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockEnqueueContentJob.mockResolvedValue('job-1');
        domainRows = [];
        eventRows = [];
        queueRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockDomainResearchTable) {
                return {
                    orderBy: () => ({
                        limit: async () => domainRows,
                    }),
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => domainRows,
                        }),
                    }),
                };
            }

            if (table === mockAcquisitionEventsTable) {
                return {
                    where: () => ({
                        orderBy: async () => eventRows,
                    }),
                };
            }

            if (table === mockContentQueueTable) {
                return {
                    where: async () => queueRows,
                };
            }

            return {
                where: async () => [],
                orderBy: () => ({ limit: async () => [] }),
            };
        });
    });

    describe('POST', () => {
        it('queues ingest_listings from listings payload', async () => {
            const response = await POST(makePostRequest({
                source: 'godaddy_auctions',
                quickMode: true,
                listings: [
                    { domain: 'alpha.com', listingType: 'auction', currentBid: 12 },
                    { domain: 'beta.com', listingType: 'buy_now', buyNowPrice: 34 },
                ],
            }));

            expect(response.status).toBe(202);
            const body = await response.json();
            expect(body.jobId).toBe('job-1');
            expect(body.listingCount).toBe(2);
            expect(mockEnqueueContentJob).toHaveBeenCalledWith(expect.objectContaining({
                jobType: 'ingest_listings',
                status: 'pending',
                payload: expect.objectContaining({
                    source: 'godaddy_auctions',
                    quickMode: true,
                    listings: expect.any(Array),
                }),
            }));
        });

        it('returns validation error for empty payload', async () => {
            const response = await POST(makePostRequest({}));
            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error).toContain('Invalid request');
            expect(mockEnqueueContentJob).not.toHaveBeenCalled();
        });
    });

    describe('GET', () => {
        it('returns candidates with optional events and queue stages', async () => {
            const createdAt = new Date('2026-02-14T00:00:00.000Z');

            domainRows = [
                {
                    id: 'research-1',
                    domain: 'alpha.com',
                    decision: 'buy',
                    createdAt,
                },
            ];
            eventRows = [
                {
                    id: 'evt-1',
                    domainResearchId: 'research-1',
                    eventType: 'scored',
                    payload: { score: 72 },
                    createdBy: 'system',
                    createdAt,
                },
            ];
            queueRows = [
                {
                    jobType: 'create_bid_plan',
                    payload: { domainResearchId: 'research-1' },
                },
            ];

            const response = await GET(makeGetRequest('http://localhost/api/acquisition/candidates?includeEvents=true&includeQueue=true&limit=5'));
            expect(response.status).toBe(200);

            const body = await response.json();
            expect(body.candidates).toHaveLength(1);
            expect(body.candidates[0].events).toHaveLength(1);
            expect(body.candidates[0].pendingStages).toContain('create_bid_plan');
        });

        it('rejects invalid decision filter', async () => {
            const response = await GET(makeGetRequest('http://localhost/api/acquisition/candidates?decision=invalid'));
            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error).toContain('Invalid decision');
        });
    });
});
