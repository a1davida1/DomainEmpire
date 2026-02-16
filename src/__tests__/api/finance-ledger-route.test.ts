import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockAdvanceDomainLifecycleForAcquisition = vi.fn();
const mockSelectLimit = vi.fn();
const mockInsertReturning = vi.fn();

const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: [...strings],
    values,
})) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => unknown);

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/domain/lifecycle-sync', () => ({
    advanceDomainLifecycleForAcquisition: mockAdvanceDomainLifecycleForAcquisition,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
    sql: sqlMock,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: mockSelectLimit,
                }),
            }),
        }),
        insert: () => ({
            values: () => ({
                returning: mockInsertReturning,
            }),
        }),
    },
    domains: {
        id: 'id',
        domain: 'domain',
    },
    domainFinanceLedgerEntries: {
        id: 'id',
        domainId: 'domain_id',
        entryDate: 'entry_date',
        entryType: 'entry_type',
        impact: 'impact',
        amount: 'amount',
        currency: 'currency',
        source: 'source',
        sourceRef: 'source_ref',
        notes: 'notes',
        metadata: 'metadata',
        createdBy: 'created_by',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
}));

const { POST } = await import('@/app/api/finance/ledger/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('finance ledger route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({
            id: '11111111-1111-4111-8111-111111111111',
            role: 'admin',
            name: 'Admin User',
        });
        mockSelectLimit.mockResolvedValue([
            { id: '22222222-2222-4222-8222-222222222222' },
        ]);
        mockInsertReturning.mockResolvedValue([
            { id: '33333333-3333-4333-8333-333333333333' },
        ]);
        mockAdvanceDomainLifecycleForAcquisition.mockResolvedValue({
            changed: true,
            fromState: 'growth',
            toState: 'monetized',
            appliedStates: ['monetized'],
            skippedReason: null,
        });
    });

    it('advances lifecycle to monetized for revenue entries', async () => {
        const response = await POST(makeRequest({
            domainId: '22222222-2222-4222-8222-222222222222',
            entryDate: '2026-02-16',
            entryType: 'revenue',
            amount: 1200,
            currency: 'USD',
        }));

        expect(response.status).toBe(201);
        expect(mockAdvanceDomainLifecycleForAcquisition).toHaveBeenCalledWith(expect.objectContaining({
            domainId: '22222222-2222-4222-8222-222222222222',
            targetState: 'monetized',
            reason: 'Revenue ledger entry recorded',
        }));
    });

    it('does not advance lifecycle for non-revenue entries', async () => {
        const response = await POST(makeRequest({
            domainId: '22222222-2222-4222-8222-222222222222',
            entryDate: '2026-02-16',
            entryType: 'build_cost',
            amount: 300,
            currency: 'USD',
        }));

        expect(response.status).toBe(201);
        expect(mockAdvanceDomainLifecycleForAcquisition).not.toHaveBeenCalled();
    });

    it('still succeeds when lifecycle automation fails', async () => {
        mockAdvanceDomainLifecycleForAcquisition.mockRejectedValueOnce(new Error('lifecycle unavailable'));

        const response = await POST(makeRequest({
            domainId: '22222222-2222-4222-8222-222222222222',
            entryDate: '2026-02-16',
            entryType: 'revenue',
            amount: 500,
            currency: 'USD',
        }));

        expect(response.status).toBe(201);
        expect(mockAdvanceDomainLifecycleForAcquisition).toHaveBeenCalledTimes(1);
    });
});
