import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEq = vi.fn((...args: unknown[]) => ({ type: 'eq', args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ type: 'and', args }));
const mockInArray = vi.fn((...args: unknown[]) => ({ type: 'inArray', args }));

vi.mock('drizzle-orm', () => ({
    eq: mockEq,
    and: mockAnd,
    inArray: mockInArray,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

const integrationConnectionsTable = { id: 'id', userId: 'user_id', provider: 'provider', status: 'status', domainId: 'domain_id', config: 'config', lastSyncAt: 'last_sync_at', lastSyncStatus: 'last_sync_status', lastSyncError: 'last_sync_error', updatedAt: 'updated_at' };
const integrationSyncRunsTable = { id: 'id', connectionId: 'connection_id', status: 'status' };
const domainsTable = { id: 'id', domain: 'domain' };
const ledgerTable = { id: 'id', domainId: 'domain_id', entryDate: 'entry_date', source: 'source', sourceRef: 'source_ref' };
const snapshotsTable = { domainId: 'domain_id', snapshotDate: 'snapshot_date' };

let ledgerInsertCount = 0;
let syncRunInsertValues: Record<string, unknown> | null = null;
let syncRunUpdateValues: Record<string, unknown> | null = null;

const mockDb = {
    select: vi.fn((_selection: Record<string, unknown>) => ({
        from: (table: unknown) => {
            if (table === integrationConnectionsTable) {
                return {
                    leftJoin: () => ({
                        where: () => ({
                            limit: async () => [
                                {
                                    id: '00000000-0000-4000-8000-000000000010',
                                    userId: '00000000-0000-4000-8000-000000000001',
                                    provider: 'sedo',
                                    status: 'connected',
                                    domainId: '00000000-0000-4000-8000-000000000100',
                                    config: {
                                        revenueRecords: [
                                            {
                                                domainId: '00000000-0000-4000-8000-000000000100',
                                                snapshotDate: '2026-02-14',
                                                amount: 42.5,
                                                sourceType: 'parking',
                                                currency: 'USD',
                                                clicks: 10,
                                                impressions: 100,
                                            },
                                        ],
                                    },
                                    domainName: 'example.com',
                                },
                            ],
                        }),
                    }),
                };
            }

            if (table === domainsTable) {
                return {
                    where: async () => [
                        {
                            id: '00000000-0000-4000-8000-000000000100',
                        },
                    ],
                };
            }

            throw new Error(`Unexpected select.from table: ${String(table)}`);
        },
    })),
    insert: vi.fn((table: unknown) => {
        if (table === integrationSyncRunsTable) {
            return {
                values: (values: Record<string, unknown>) => {
                    syncRunInsertValues = values;
                    return {
                        returning: async () => [{ id: 'run-1' }],
                    };
                },
            };
        }

        throw new Error(`Unexpected db.insert table: ${String(table)}`);
    }),
    update: vi.fn((table: unknown) => {
        if (table === integrationSyncRunsTable) {
            return {
                set: (values: Record<string, unknown>) => {
                    syncRunUpdateValues = values;
                    return {
                        where: () => ({
                            returning: async () => [{ id: 'run-1', ...values }],
                        }),
                    };
                },
            };
        }

        if (table === integrationConnectionsTable) {
            return {
                set: () => ({
                    where: async () => [],
                }),
            };
        }

        throw new Error(`Unexpected db.update table: ${String(table)}`);
    }),
    transaction: vi.fn(async (fn: (tx: {
        insert: (table: unknown) => {
            values: (values?: Record<string, unknown>) => {
                onConflictDoNothing?: (input: Record<string, unknown>) => {
                    returning: (returningShape: Record<string, unknown>) => Promise<Array<{ id: string }>>;
                };
                onConflictDoUpdate?: (input: Record<string, unknown>) => Promise<void>;
            };
        };
    }) => Promise<void>) => {
        const tx = {
            insert: (table: unknown) => {
                if (table === ledgerTable) {
                    return {
                        values: () => ({
                            onConflictDoNothing: () => ({
                                returning: async () => {
                                    ledgerInsertCount += 1;
                                    return []; // Simulate duplicate/conflict row, so no new insert
                                },
                            }),
                            onConflictDoUpdate: async () => undefined,
                        }),
                    };
                }

                if (table === snapshotsTable) {
                    return {
                        values: () => ({
                            onConflictDoUpdate: async () => undefined,
                        }),
                    };
                }

                throw new Error(`Unexpected tx.insert table: ${String(table)}`);
            },
        };

        await fn(tx);
    }),
};

vi.mock('@/lib/db', () => ({
    db: mockDb,
    integrationConnections: integrationConnectionsTable,
    integrationSyncRuns: integrationSyncRunsTable,
    domains: domainsTable,
    domainFinanceLedgerEntries: ledgerTable,
    revenueSnapshots: snapshotsTable,
    domainOwnershipEvents: {},
    domainRegistrarProfiles: {},
}));

vi.mock('@/lib/domain/renewals', () => ({
    syncRenewalDates: vi.fn(),
}));

vi.mock('@/lib/domain/registrar-operations', () => ({
    computeRegistrarExpirationRisk: vi.fn(),
    isRegistrarTransferStatus: vi.fn(),
}));

vi.mock('@/lib/analytics/cloudflare', () => ({
    getDomainAnalytics: vi.fn(),
}));

vi.mock('@/lib/analytics/search-console', () => ({
    getDomainGSCSummary: vi.fn(),
}));

const { runIntegrationConnectionSync } = await import('@/lib/integrations/executor');

describe('runIntegrationConnectionSync revenue idempotency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ledgerInsertCount = 0;
        syncRunInsertValues = null;
        syncRunUpdateValues = null;
    });

    it('does not upsert snapshot totals when ledger insert conflicts', async () => {
        const result = await runIntegrationConnectionSync(
            '00000000-0000-4000-8000-000000000010',
            {
                userId: '00000000-0000-4000-8000-000000000001',
                role: 'admin',
            },
            { days: 30 },
        );

        expect('error' in result).toBe(false);
        if ('error' in result) return;

        expect(syncRunInsertValues).toBeTruthy();
        expect(syncRunUpdateValues).toBeTruthy();
        expect(ledgerInsertCount).toBe(1);
        expect(result.run.recordsProcessed).toBe(1);
        expect(result.run.recordsUpserted).toBe(0);
        expect(result.run.details).toEqual(expect.objectContaining({
            ingestedRows: 0,
            duplicatesSkipped: 1,
            affectedSnapshotRows: 0,
        }));
    });
});
