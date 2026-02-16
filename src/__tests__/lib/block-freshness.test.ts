import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectResult = vi.fn();

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => mockSelectResult(),
            }),
        }),
        selectDistinct: () => ({
            from: () => mockSelectResult(),
        }),
    },
}));

vi.mock('@/lib/db/schema', () => ({
    pageDefinitions: {
        id: 'id',
        route: 'route',
        domainId: 'domain_id',
        blocks: 'blocks',
    },
}));

const { checkBlockFreshness, checkAllDomainBlockFreshness } = await import('@/lib/deploy/blocks/freshness');

const DOMAIN_ID = '00000000-0000-4000-8000-000000000001';

describe('block freshness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.setSystemTime(new Date('2026-02-16T14:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    beforeAll(() => {
        vi.useFakeTimers();
    });

    describe('checkBlockFreshness', () => {
        it('reports all blocks as stale when no _generatedAt', async () => {
            mockSelectResult.mockResolvedValue([{
                id: 'page-1',
                route: '/',
                domainId: DOMAIN_ID,
                blocks: [
                    { id: 'b1', type: 'Hero', content: {} },
                    { id: 'b2', type: 'CTA', content: {} },
                ],
            }]);

            const report = await checkBlockFreshness(DOMAIN_ID, 30);
            expect(report.totalBlocks).toBe(2);
            expect(report.staleBlocks).toHaveLength(2);
            expect(report.freshBlocks).toBe(0);
            expect(report.staleBlocks[0].blockId).toBe('b1');
            expect(report.staleBlocks[0].generatedAt).toBeNull();
        });

        it('reports fresh blocks when _generatedAt is recent', async () => {
            const recentDate = new Date('2026-02-10T12:00:00Z').toISOString();
            mockSelectResult.mockResolvedValue([{
                id: 'page-1',
                route: '/',
                domainId: DOMAIN_ID,
                blocks: [
                    { id: 'b1', type: 'Hero', content: { _generatedAt: recentDate } },
                ],
            }]);

            const report = await checkBlockFreshness(DOMAIN_ID, 30);
            expect(report.totalBlocks).toBe(1);
            expect(report.staleBlocks).toHaveLength(0);
            expect(report.freshBlocks).toBe(1);
        });

        it('flags blocks older than threshold', async () => {
            const oldDate = new Date('2025-12-01T12:00:00Z').toISOString();
            mockSelectResult.mockResolvedValue([{
                id: 'page-1',
                route: '/',
                domainId: DOMAIN_ID,
                blocks: [
                    { id: 'b1', type: 'Hero', content: { _generatedAt: oldDate } },
                ],
            }]);

            const report = await checkBlockFreshness(DOMAIN_ID, 30);
            expect(report.staleBlocks).toHaveLength(1);
            expect(report.staleBlocks[0].generatedAt).toBe(oldDate);
            expect(report.staleBlocks[0].ageDays).toBeGreaterThan(30);
        });

        it('handles empty pages', async () => {
            mockSelectResult.mockResolvedValue([]);
            const report = await checkBlockFreshness(DOMAIN_ID, 30);
            expect(report.totalBlocks).toBe(0);
            expect(report.staleBlocks).toHaveLength(0);
        });

        it('tracks oldest block age', async () => {
            const veryOld = new Date('2025-01-01T00:00:00Z').toISOString();
            const recent = new Date('2026-02-15T00:00:00Z').toISOString();
            mockSelectResult.mockResolvedValue([{
                id: 'page-1',
                route: '/',
                domainId: DOMAIN_ID,
                blocks: [
                    { id: 'b1', type: 'Hero', content: { _generatedAt: veryOld } },
                    { id: 'b2', type: 'CTA', content: { _generatedAt: recent } },
                ],
            }]);

            const report = await checkBlockFreshness(DOMAIN_ID, 30);
            expect(report.oldestBlockAge).toBeGreaterThan(400);
            expect(report.staleBlocks).toHaveLength(1);
            expect(report.freshBlocks).toBe(1);
        });
    });

    describe('checkAllDomainBlockFreshness', () => {
        it('returns reports only for domains with stale blocks', async () => {
            // First call: selectDistinct for domain IDs
            mockSelectResult
                .mockResolvedValueOnce([{ domainId: DOMAIN_ID }])
                // Second call: checkBlockFreshness pages query
                .mockResolvedValueOnce([{
                    id: 'page-1',
                    route: '/',
                    domainId: DOMAIN_ID,
                    blocks: [
                        { id: 'b1', type: 'Hero', content: {} },
                    ],
                }]);

            const reports = await checkAllDomainBlockFreshness(30);
            expect(reports).toHaveLength(1);
            expect(reports[0].domainId).toBe(DOMAIN_ID);
            expect(reports[0].staleBlocks).toHaveLength(1);
        });

        it('returns empty array when all blocks are fresh', async () => {
            const recent = new Date('2026-02-15T00:00:00Z').toISOString();
            mockSelectResult
                .mockResolvedValueOnce([{ domainId: DOMAIN_ID }])
                .mockResolvedValueOnce([{
                    id: 'page-1',
                    route: '/',
                    domainId: DOMAIN_ID,
                    blocks: [
                        { id: 'b1', type: 'Hero', content: { _generatedAt: recent } },
                    ],
                }]);

            const reports = await checkAllDomainBlockFreshness(30);
            expect(reports).toHaveLength(0);
        });
    });
});
