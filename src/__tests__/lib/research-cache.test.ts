import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockOnConflictDoUpdate = vi.fn();
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockGenerateJSON = vi.fn();
const mockEnqueueContentJob = vi.fn();

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    ilike: vi.fn((...args: unknown[]) => ({ type: 'ilike', args })),
    or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: mockSelect,
        insert: mockInsert,
    },
    researchCache: {
        id: 'id',
        queryHash: 'query_hash',
        queryText: 'query_text',
        resultJson: 'result_json',
        sourceModel: 'source_model',
        fetchedAt: 'fetched_at',
        expiresAt: 'expires_at',
        domainPriority: 'domain_priority',
    },
}));

vi.mock('@/lib/ai/openrouter', () => ({
    getAIClient: () => ({
        generateJSON: mockGenerateJSON,
    }),
}));

vi.mock('@/lib/queue/content-queue', () => ({
    enqueueContentJob: mockEnqueueContentJob,
}));

const { generateResearchWithCache } = await import('@/lib/ai/research-cache');

function queryHashFor(queryText: string): string {
    return createHash('sha256').update(queryText.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
}

describe('research-cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEnqueueContentJob.mockResolvedValue('job-refresh-1');
        mockOnConflictDoUpdate.mockResolvedValue(undefined);
    });

    it('returns merged cached results on hit without calling external AI', async () => {
        const now = Date.now();
        const queryText = 'keyword-serp:alpha.com:finance';
        const queryHash = queryHashFor(queryText);

        mockLimit.mockResolvedValue([
            {
                id: 'cache-1',
                queryHash,
                queryText,
                resultJson: {
                    statistics: [{ stat: 'A' }],
                    competitorHooks: ['Hook 1'],
                },
                sourceModel: 'perplexity/sonar-reasoning',
                fetchedAt: new Date(now - 1_000),
                expiresAt: new Date(now + 60_000),
                domainPriority: 3,
            },
            {
                id: 'cache-2',
                queryHash,
                queryText,
                resultJson: {
                    statistics: [{ stat: 'A' }, { stat: 'B' }],
                    competitorHooks: ['Hook 2'],
                },
                sourceModel: 'perplexity/sonar-reasoning',
                fetchedAt: new Date(now - 2_000),
                expiresAt: new Date(now + 60_000),
                domainPriority: 4,
            },
        ]);

        const response = await generateResearchWithCache({
            queryText,
            prompt: 'prompt',
            domainPriority: 3,
            emptyResult: {
                statistics: [],
                competitorHooks: [],
            },
        });

        expect(response.cacheStatus).toBe('hit');
        expect(response.model).toBe('cachedKnowledgeBase');
        expect(response.cacheEntries).toBe(2);
        expect(response.data).toEqual({
            statistics: [{ stat: 'A' }, { stat: 'B' }],
            competitorHooks: ['Hook 1', 'Hook 2'],
        });
        expect(mockGenerateJSON).not.toHaveBeenCalled();
    });

    it('calls external research and upserts cache on miss', async () => {
        mockLimit.mockResolvedValue([]);
        mockGenerateJSON.mockResolvedValue({
            data: { statistics: [{ stat: 'Live' }], competitorHooks: ['Live Hook'] },
            modelKey: 'research',
            model: 'perplexity/sonar-reasoning',
            resolvedModel: 'perplexity/sonar-reasoning',
            promptVersion: 'research.v1',
            routingVersion: '2026-02-14.v1',
            fallbackUsed: false,
            fallbackIndex: 0,
            inputTokens: 120,
            outputTokens: 90,
            cost: 0.03,
            durationMs: 500,
        });

        const response = await generateResearchWithCache({
            queryText: 'market-analysis:alpha.com:finance',
            prompt: 'prompt',
            domainPriority: 2,
            emptyResult: { statistics: [], competitorHooks: [] },
        });

        expect(response.cacheStatus).toBe('miss');
        expect(response.model).toBe('perplexity/sonar-reasoning');
        expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
        expect(mockInsert).toHaveBeenCalledTimes(1);
        expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    });

    it('returns empty fallback and queues refresh job when provider fails', async () => {
        mockLimit.mockResolvedValue([]);
        mockGenerateJSON.mockRejectedValue(new Error('provider unavailable'));

        const response = await generateResearchWithCache({
            queryText: 'market-analysis:alpha.com:finance',
            prompt: 'prompt',
            domainPriority: 1,
            emptyResult: { statistics: [], competitorHooks: [] },
        });

        expect(response.cacheStatus).toBe('miss');
        expect(response.fallbackUsed).toBe(true);
        expect(response.model).toBe('cachedKnowledgeBase');
        expect(response.data).toEqual({ statistics: [], competitorHooks: [] });
        expect(mockEnqueueContentJob).toHaveBeenCalledWith(expect.objectContaining({
            jobType: 'refresh_research_cache',
            status: 'pending',
        }));
    });
});
