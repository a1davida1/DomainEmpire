import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateNotification = vi.fn();
const mockNotDeleted = vi.fn(() => ({ type: 'notDeleted' }));

const mockTables = {
    ledger: {
        impact: 'impact',
        entryDate: 'entryDate',
        amount: 'amount',
        domainId: 'domainId',
    },
    snapshots: {
        snapshotDate: 'snapshotDate',
        totalRevenue: 'totalRevenue',
        domainId: 'domainId',
    },
    domains: {
        id: 'id',
        domain: 'domain',
        deletedAt: 'deletedAt',
    },
};

let ledgerRows: Array<{ domainId: string; total: number }> = [];
let snapshotRows: Array<{ domainId: string; total: number }> = [];
let domainRows: Array<{ id: string; domain: string }> = [];
let selectCallIndex = 0;

const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: [...strings],
    values,
})) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => unknown);

vi.mock('drizzle-orm', () => ({
    asc: vi.fn((...args: unknown[]) => ({ type: 'asc', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
    sql: sqlMock,
}));

vi.mock('@/lib/db/soft-delete', () => ({
    notDeleted: mockNotDeleted,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => {
            const callIndex = selectCallIndex++;
            return {
                from: () => ({
                    where: () => ({
                        groupBy: () => ({
                            orderBy: () => ({
                                limit: async () => {
                                    if (callIndex === 0) return ledgerRows;
                                    if (callIndex === 1) return snapshotRows;
                                    return [];
                                },
                            }),
                        }),
                        limit: async () => {
                            if (callIndex === 2) return domainRows;
                            return [];
                        },
                    }),
                }),
            };
        },
    },
    domainFinanceLedgerEntries: mockTables.ledger,
    revenueSnapshots: mockTables.snapshots,
    domains: mockTables.domains,
}));

const { runRevenueReconciliationSweep } = await import('@/lib/finance/reconciliation-monitor');

describe('runRevenueReconciliationSweep', () => {
    const originalEnv = process.env.FINANCE_RECONCILIATION_SWEEP_ENABLED;

    beforeEach(() => {
        vi.clearAllMocks();
        ledgerRows = [];
        snapshotRows = [];
        domainRows = [];
        selectCallIndex = 0;
        if (originalEnv === undefined) {
            delete process.env.FINANCE_RECONCILIATION_SWEEP_ENABLED;
        } else {
            process.env.FINANCE_RECONCILIATION_SWEEP_ENABLED = originalEnv;
        }
    });

    it('creates a critical alert when variance exceeds tolerance', async () => {
        ledgerRows = [{ domainId: 'domain-1', total: 100 }];
        snapshotRows = [{ domainId: 'domain-1', total: 70 }];
        domainRows = [{ id: 'domain-1', domain: 'example.com' }];

        const summary = await runRevenueReconciliationSweep({
            windowDays: 14,
            toleranceFloor: 5,
            tolerancePct: 0.05,
        });

        expect(summary.domainsCompared).toBe(1);
        expect(summary.critical).toBe(1);
        expect(summary.warning).toBe(0);
        expect(summary.alertsCreated).toBe(1);
        expect(mockCreateNotification).toHaveBeenCalledTimes(1);
        expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
            domainId: 'domain-1',
            severity: 'critical',
            title: expect.stringContaining('Revenue reconciliation critical'),
        }));
    });

    it('short-circuits when sweep is disabled', async () => {
        process.env.FINANCE_RECONCILIATION_SWEEP_ENABLED = 'false';

        const summary = await runRevenueReconciliationSweep();

        expect(summary.domainsCompared).toBe(0);
        expect(summary.alertsCreated).toBe(0);
        expect(mockCreateNotification).not.toHaveBeenCalled();
    });
});
