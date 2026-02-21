import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateDirectUploadProject = vi.fn();
const mockDirectUploadDeploy = vi.fn();
const mockAddCustomDomain = vi.fn();
const mockGetZoneNameservers = vi.fn();
const mockVerifyDomainPointsToCloudflare = vi.fn();
const mockEnsurePagesDnsRecord = vi.fn();
const mockUpdateNameservers = vi.fn();
const mockGenerateSiteFiles = vi.fn();
const mockResolveCloudflareHostShardPlan = vi.fn();
const mockRecordCloudflareHostShardOutcome = vi.fn();
const mockAdvanceDomainLifecycleForAcquisition = vi.fn();

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

const mockContentQueueTable = {
    id: 'id',
    domainId: 'domain_id',
};
const mockDomainsTable = {
    id: 'id',
    domain: 'domain',
    cloudflareAccount: 'cloudflare_account',
    isDeployed: 'is_deployed',
    lastDeployedAt: 'last_deployed_at',
    updatedAt: 'updated_at',
};
const mockArticlesTable = {
    domainId: 'domain_id',
};
const mockPageDefinitionsTable = {
    domainId: 'domain_id',
    isPublished: 'is_published',
};

vi.mock('@/lib/deploy/cloudflare', () => ({
    createDirectUploadProject: mockCreateDirectUploadProject,
    directUploadDeploy: mockDirectUploadDeploy,
    addCustomDomain: mockAddCustomDomain,
    getZoneNameservers: mockGetZoneNameservers,
    verifyDomainPointsToCloudflare: mockVerifyDomainPointsToCloudflare,
    ensurePagesDnsRecord: mockEnsurePagesDnsRecord,
}));

vi.mock('@/lib/deploy/godaddy', () => ({
    updateNameservers: mockUpdateNameservers,
}));

vi.mock('@/lib/deploy/generator', () => ({
    generateSiteFiles: mockGenerateSiteFiles,
}));

vi.mock('@/lib/deploy/host-sharding', () => ({
    resolveCloudflareHostShardPlan: mockResolveCloudflareHostShardPlan,
    recordCloudflareHostShardOutcome: mockRecordCloudflareHostShardOutcome,
}));

vi.mock('@/lib/domain/lifecycle-sync', () => ({
    advanceDomainLifecycleForAcquisition: mockAdvanceDomainLifecycleForAcquisition,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    count: vi.fn(() => ({ type: 'count' })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return {
                from: (table: unknown) => {
                    if (table === mockContentQueueTable) {
                        return {
                            where: () => ({
                                limit: async () => [{
                                    id: 'job-1',
                                    domainId: 'domain-1',
                                    payload: {
                                        domain: 'example.com',
                                        triggerBuild: true,
                                        addCustomDomain: false,
                                        cloudflareAccount: null,
                                    },
                                    attempts: 0,
                                }],
                            }),
                        };
                    }
                    if (table === mockDomainsTable) {
                        return {
                            where: () => ({
                                limit: async () => [{
                                    id: 'domain-1',
                                    domain: 'example.com',
                                    cloudflareAccount: null,
                                }],
                            }),
                        };
                    }
                    if (table === mockArticlesTable) {
                        return {
                            where: async () => [{ count: 1 }],
                        };
                    }
                    if (table === mockPageDefinitionsTable) {
                        return {
                            where: async () => [{ count: 0 }],
                        };
                    }
                    return {
                        where: () => ({
                            limit: async () => [],
                        }),
                    };
                },
            };
        },
        update: (...args: unknown[]) => {
            mockUpdate(...args);
            return {
                set: (...setArgs: unknown[]) => {
                    mockSet(...setArgs);
                    return {
                        where: (...whereArgs: unknown[]) => {
                            mockWhere(...whereArgs);
                            return Promise.resolve([]);
                        },
                    };
                },
            };
        },
    },
    domains: mockDomainsTable,
    contentQueue: mockContentQueueTable,
    articles: mockArticlesTable,
    pageDefinitions: mockPageDefinitionsTable,
}));

const { processDeployJob } = await import('../../lib/deploy/processor');

describe('deploy processor lifecycle automation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveCloudflareHostShardPlan.mockResolvedValue({
            primary: {
                shardKey: 'shard-1',
                connectionId: null,
                cloudflare: {
                    accountId: 'cf-account-1',
                    apiToken: 'cf-token-1',
                },
            },
            all: [{
                shardKey: 'shard-1',
                connectionId: null,
                cloudflare: {
                    accountId: 'cf-account-1',
                    apiToken: 'cf-token-1',
                },
            }],
        });
        mockGenerateSiteFiles.mockResolvedValue([
            { path: 'index.html', content: '<html></html>' },
        ]);
        mockCreateDirectUploadProject.mockResolvedValue({
            success: true,
            projectName: 'example-com',
        });
        mockDirectUploadDeploy.mockResolvedValue({
            success: true,
            url: 'https://example-com.pages.dev',
        });
        mockAddCustomDomain.mockResolvedValue({ success: true });
        mockGetZoneNameservers.mockResolvedValue(null);
        mockUpdateNameservers.mockResolvedValue(undefined);
        mockEnsurePagesDnsRecord.mockResolvedValue({
            success: true,
            action: 'created',
        });
        mockVerifyDomainPointsToCloudflare.mockResolvedValue({
            verified: false,
            nameservers: [],
            detail: 'DNS NS lookup failed for example.com: test',
        });
        mockAdvanceDomainLifecycleForAcquisition.mockResolvedValue({
            changed: true,
            fromState: 'acquired',
            toState: 'build',
            appliedStates: ['build'],
            skippedReason: null,
        });
    });

    it('advances lifecycle to build after successful deploy processing', async () => {
        await processDeployJob('job-1');

        expect(mockCreateDirectUploadProject).toHaveBeenCalledTimes(1);
        expect(mockDirectUploadDeploy).toHaveBeenCalledTimes(1);
        expect(mockAdvanceDomainLifecycleForAcquisition).toHaveBeenCalledWith(expect.objectContaining({
            domainId: 'domain-1',
            targetState: 'build',
            reason: 'Deployment completed successfully',
        }));
    });

    it('aborts immediately when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort('timeout:600000');

        await expect(processDeployJob('job-1', controller.signal)).rejects.toThrow('Deploy job aborted');
        expect(mockCreateDirectUploadProject).not.toHaveBeenCalled();
        expect(mockDirectUploadDeploy).not.toHaveBeenCalled();
    });
});
