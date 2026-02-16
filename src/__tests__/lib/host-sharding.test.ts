import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectWhere = vi.fn();
const mockDecryptSecret = vi.fn();
const mockResolveCloudflareAccountByReference = vi.fn();

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: mockSelectWhere,
            }),
        }),
    },
    integrationConnections: {
        id: 'id',
        displayName: 'display_name',
        config: 'config',
        encryptedCredential: 'encrypted_credential',
        provider: 'provider',
        status: 'status',
        domainId: 'domain_id',
    },
    cloudflareShardHealth: {
        shardKey: 'shard_key',
        accountId: 'account_id',
        sourceConnectionId: 'source_connection_id',
        penalty: 'penalty',
        cooldownUntil: 'cooldown_until',
        updatedAt: 'updated_at',
        successCount: 'success_count',
        rateLimitCount: 'rate_limit_count',
        failureCount: 'failure_count',
    },
    domains: {
        cloudflareAccount: 'cloudflare_account',
        niche: 'niche',
        deletedAt: 'deleted_at',
    },
}));

vi.mock('@/lib/security/encryption', () => ({
    decryptSecret: mockDecryptSecret,
}));

vi.mock('@/lib/deploy/cloudflare', () => ({
    resolveCloudflareAccountByReference: mockResolveCloudflareAccountByReference,
}));

const {
    recordCloudflareHostShardOutcome,
    resolveCloudflareHostShard,
    resolveCloudflareHostShardPlan,
    clearCloudflareHostShardCache,
} = await import('@/lib/deploy/host-sharding');

describe('cloudflare host sharding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCloudflareHostShardCache();
        mockDecryptSecret.mockImplementation((value: string) => `token:${value}`);
        mockResolveCloudflareAccountByReference.mockResolvedValue(null);
        mockSelectWhere.mockResolvedValue([]);
    });

    it('falls back to default routing when no shard connections exist', async () => {
        const shard = await resolveCloudflareHostShard({
            domain: 'example.com',
            cloudflareAccount: null,
        });

        expect(shard.strategy).toBe('default');
        expect(shard.shardKey).toBe('default');
        expect(shard.cloudflare).toEqual({});
    });

    it('resolves direct account-id override without shard connections', async () => {
        const shard = await resolveCloudflareHostShard({
            domain: 'example.com',
            cloudflareAccount: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        });

        expect(shard.strategy).toBe('domain_override');
        expect(shard.source).toBe('domain_reference');
        expect(shard.cloudflare).toEqual({
            accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        });
    });

    it('uses deterministic shard selection and respects explicit override keys', async () => {
        mockSelectWhere.mockResolvedValue([
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                },
                encryptedCredential: 'cred-b',
            },
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                encryptedCredential: 'cred-a',
            },
        ]);

        const first = await resolveCloudflareHostShard({
            domain: 'deterministic-example.com',
            cloudflareAccount: null,
        });
        const second = await resolveCloudflareHostShard({
            domain: 'deterministic-example.com',
            cloudflareAccount: null,
        });

        expect(first.shardKey).toBe(second.shardKey);
        expect(['a', 'b']).toContain(first.shardKey);
        expect(first.strategy).toBe('hash_bucket');

        const override = await resolveCloudflareHostShard({
            domain: 'deterministic-example.com',
            cloudflareAccount: 'b',
        });

        expect(override.strategy).toBe('domain_override');
        expect(override.shardKey).toBe('b');
        expect(override.cloudflare).toEqual({
            accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            apiToken: 'token:cred-b',
        });
    });

    it('returns fallback shards in plan order', async () => {
        mockSelectWhere.mockResolvedValue([
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                encryptedCredential: 'cred-a',
            },
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                },
                encryptedCredential: 'cred-b',
            },
            {
                id: 'connection-c',
                displayName: 'Shard C',
                config: {
                    shardKey: 'c',
                    accountId: 'cccccccccccccccccccccccccccccccc',
                },
                encryptedCredential: 'cred-c',
            },
        ]);

        const plan = await resolveCloudflareHostShardPlan({
            domain: 'failover-example.com',
            cloudflareAccount: 'a',
            maxFallbacks: 2,
        });

        expect(plan.primary.shardKey).toBe('a');
        expect(plan.fallbacks).toHaveLength(2);
        expect(plan.fallbacks.map((shard) => shard.shardKey).sort()).toEqual(['b', 'c']);
    });

    it('deprioritizes shards in cooldown after rate-limit outcomes', async () => {
        mockSelectWhere.mockResolvedValue([
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                encryptedCredential: 'cred-a',
            },
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                },
                encryptedCredential: 'cred-b',
            },
        ]);

        const baseline = await resolveCloudflareHostShardPlan({
            domain: 'cooldown-example.com',
        });
        recordCloudflareHostShardOutcome(baseline.primary.shardKey, 'rate_limited');

        const rerouted = await resolveCloudflareHostShardPlan({
            domain: 'cooldown-example.com',
        });

        expect(rerouted.primary.shardKey).not.toBe(baseline.primary.shardKey);
        expect(rerouted.fallbacks.map((shard) => shard.shardKey)).toContain(baseline.primary.shardKey);
    });

    it('prefers region-aligned shards when routingRegion is set', async () => {
        mockSelectWhere.mockResolvedValue([
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    region: 'us-east',
                    shardWeight: 120,
                },
                encryptedCredential: 'cred-a',
            },
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    region: 'eu-west',
                    shardWeight: 120,
                },
                encryptedCredential: 'cred-b',
            },
        ]);

        const plan = await resolveCloudflareHostShardPlan({
            domain: 'regional-example.com',
            routingRegion: 'us-east',
        });

        expect(plan.primary.region).toBe('us-east');
        expect(plan.primary.shardKey).toBe('a');
    });

    it('biases toward lower-capacity shards when one shard is overloaded', async () => {
        const shardRows = [
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                encryptedCredential: 'cred-a',
            },
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                },
                encryptedCredential: 'cred-b',
            },
        ];
        const assignmentRows = [
            ...Array.from({ length: 120 }, (_, index) => ({
                cloudflareAccount: 'a',
                niche: index % 2 === 0 ? 'legal' : 'insurance',
            })),
            ...Array.from({ length: 8 }, (_, index) => ({
                cloudflareAccount: 'b',
                niche: index % 2 === 0 ? 'legal' : 'insurance',
            })),
        ];

        mockSelectWhere
            .mockResolvedValueOnce(shardRows)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(assignmentRows);

        let selectedA = 0;
        let selectedB = 0;
        for (let index = 0; index < 24; index += 1) {
            const plan = await resolveCloudflareHostShardPlan({
                domain: `capacity-bias-${index}.example`,
            });
            if (plan.primary.shardKey === 'a') selectedA += 1;
            if (plan.primary.shardKey === 'b') selectedB += 1;
        }

        expect(selectedB).toBeGreaterThan(selectedA);
    });

    it('balances same-niche placement across shards', async () => {
        const shardRows = [
            {
                id: 'connection-a',
                displayName: 'Shard A',
                config: {
                    shardKey: 'a',
                    accountId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
                encryptedCredential: 'cred-a',
            },
            {
                id: 'connection-b',
                displayName: 'Shard B',
                config: {
                    shardKey: 'b',
                    accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                },
                encryptedCredential: 'cred-b',
            },
        ];
        const assignmentRows = [
            ...Array.from({ length: 20 }, () => ({
                cloudflareAccount: 'a',
                niche: 'legal',
            })),
            ...Array.from({ length: 10 }, () => ({
                cloudflareAccount: 'a',
                niche: 'finance',
            })),
            ...Array.from({ length: 5 }, () => ({
                cloudflareAccount: 'b',
                niche: 'legal',
            })),
            ...Array.from({ length: 25 }, () => ({
                cloudflareAccount: 'b',
                niche: 'finance',
            })),
        ];

        mockSelectWhere
            .mockResolvedValueOnce(shardRows)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(assignmentRows);

        let selectedA = 0;
        let selectedB = 0;
        for (let index = 0; index < 24; index += 1) {
            const plan = await resolveCloudflareHostShardPlan({
                domain: `niche-balance-${index}.example`,
                domainNiche: 'legal',
            });
            if (plan.primary.shardKey === 'a') selectedA += 1;
            if (plan.primary.shardKey === 'b') selectedB += 1;
        }

        expect(selectedB).toBeGreaterThan(selectedA);
    });
});
