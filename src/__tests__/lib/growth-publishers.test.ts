import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishToGrowthChannel } from '@/lib/growth/publishers';

const originalEnv = {
    growthPublishMock: process.env.GROWTH_PUBLISH_MOCK,
    pinterestToken: process.env.PINTEREST_ACCESS_TOKEN,
    pinterestBoard: process.env.PINTEREST_BOARD_ID,
    pinterestApiBase: process.env.PINTEREST_API_BASE,
    youtubeToken: process.env.YOUTUBE_ACCESS_TOKEN,
    youtubeChannel: process.env.YOUTUBE_CHANNEL_ID,
};
const originalFetch = globalThis.fetch;

afterEach(() => {
    process.env.GROWTH_PUBLISH_MOCK = originalEnv.growthPublishMock;
    process.env.PINTEREST_ACCESS_TOKEN = originalEnv.pinterestToken;
    process.env.PINTEREST_BOARD_ID = originalEnv.pinterestBoard;
    process.env.PINTEREST_API_BASE = originalEnv.pinterestApiBase;
    process.env.YOUTUBE_ACCESS_TOKEN = originalEnv.youtubeToken;
    process.env.YOUTUBE_CHANNEL_ID = originalEnv.youtubeChannel;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

const payload = {
    campaignId: 'campaign-1',
    domain: 'alpha.com',
    destinationUrl: 'https://alpha.com',
    copy: 'Promo copy',
    creativeHash: 'abc123def456',
    assetUrl: 'https://cdn.example.com/asset.jpg',
};

describe('growth publishers', () => {
    it('publishes pinterest in mock mode by default', async () => {
        delete process.env.GROWTH_PUBLISH_MOCK;

        const result = await publishToGrowthChannel('pinterest', payload);
        expect(result.status).toBe('published');
        expect(result.externalPostId).toContain('pinterest-mock');
    });

    it('publishes youtube shorts in mock mode', async () => {
        process.env.GROWTH_PUBLISH_MOCK = 'true';

        const result = await publishToGrowthChannel('youtube_shorts', payload);
        expect(result.status).toBe('published');
        expect(result.externalPostId).toContain('youtube_shorts-mock');
    });

    it('throws for live pinterest publishing when credentials are missing', async () => {
        process.env.GROWTH_PUBLISH_MOCK = 'false';
        delete process.env.PINTEREST_ACCESS_TOKEN;
        delete process.env.PINTEREST_BOARD_ID;

        await expect(publishToGrowthChannel('pinterest', payload))
            .rejects
            .toThrow('PINTEREST_ACCESS_TOKEN');
    });

    it('publishes pinterest in live mode using API response id', async () => {
        process.env.GROWTH_PUBLISH_MOCK = 'false';
        process.env.PINTEREST_ACCESS_TOKEN = 'test-token';
        process.env.PINTEREST_BOARD_ID = 'board-1';
        process.env.PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: 'pin-123' }), {
                status: 201,
                headers: { 'content-type': 'application/json' },
            }),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        const result = await publishToGrowthChannel('pinterest', payload);
        expect(result.externalPostId).toBe('pin-123');
        expect(result.status).toBe('published');
        expect(result.metadata.mode).toBe('live');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('publishes pinterest in live mode using stored credential override', async () => {
        process.env.GROWTH_PUBLISH_MOCK = 'false';
        delete process.env.PINTEREST_ACCESS_TOKEN;
        delete process.env.PINTEREST_BOARD_ID;
        process.env.PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: 'pin-xyz' }), {
                status: 201,
                headers: { 'content-type': 'application/json' },
            }),
        );
        globalThis.fetch = fetchMock as typeof fetch;

        const result = await publishToGrowthChannel('pinterest', payload, {
            credential: {
                accessToken: 'stored-token',
                pinterestBoardId: 'stored-board',
            },
        });

        expect(result.externalPostId).toBe('pin-xyz');
        expect(result.metadata.credentialSource).toBe('stored');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails youtube live mode when no assetUrl is provided', async () => {
        process.env.GROWTH_PUBLISH_MOCK = 'false';

        await expect(publishToGrowthChannel('youtube_shorts', {
            ...payload,
            assetUrl: null,
        }))
            .rejects
            .toThrow('requires assetUrl');
    });
});
