import { withHttpRetry } from '@/lib/tpilot/core/retry';
import { safeDownloadToBuffer } from '@/lib/tpilot/core/ssrf';

export type GrowthPublishChannel = 'pinterest' | 'youtube_shorts';

export interface GrowthPublishPayload {
    campaignId: string;
    domain: string;
    destinationUrl: string;
    copy: string;
    creativeHash: string;
    assetUrl?: string | null;
}

export interface GrowthPublishResult {
    externalPostId: string;
    status: 'published' | 'queued';
    metadata: Record<string, unknown>;
}

export interface GrowthPublishCredential {
    accessToken: string;
    pinterestBoardId?: string;
    youtubeChannelId?: string;
}

export interface GrowthPublishOptions {
    credential?: GrowthPublishCredential | null;
}

const DEFAULT_TIMEOUT_MS = Number.isFinite(Number.parseInt(process.env.GROWTH_PUBLISH_TIMEOUT_MS || '', 10))
    ? Math.max(3_000, Number.parseInt(process.env.GROWTH_PUBLISH_TIMEOUT_MS || '', 10))
    : 20_000;
const DEFAULT_MAX_VIDEO_BYTES = Number.isFinite(Number.parseInt(process.env.GROWTH_PUBLISH_MAX_VIDEO_BYTES || '', 10))
    ? Math.max(1_000_000, Number.parseInt(process.env.GROWTH_PUBLISH_MAX_VIDEO_BYTES || '', 10))
    : 80 * 1024 * 1024;

function isMockEnabled(): boolean {
    const raw = process.env.GROWTH_PUBLISH_MOCK;
    if (!raw) return true;
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw.toLowerCase());
}

function buildMockId(channel: GrowthPublishChannel, seed: string): string {
    const suffix = Date.now().toString(36);
    return `${channel}-mock-${seed.slice(0, 8)}-${suffix}`;
}

function assertEnv(key: string): string {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function buildPinterestTitle(payload: GrowthPublishPayload): string {
    const base = normalizeWhitespace(payload.copy);
    if (base.length > 0) {
        return truncate(base, 100);
    }
    return truncate(`Domain spotlight: ${payload.domain}`, 100);
}

function buildYouTubeTitle(payload: GrowthPublishPayload): string {
    const titleBase = normalizeWhitespace(payload.copy).replace(/[#@]/g, '').trim();
    const combined = titleBase.length > 0
        ? `${titleBase} #shorts`
        : `Domain spotlight: ${payload.domain} #shorts`;
    return truncate(combined, 100);
}

function buildYouTubeDescription(payload: GrowthPublishPayload): string {
    const lines = [
        truncate(normalizeWhitespace(payload.copy), 2500),
        '',
        payload.destinationUrl,
        '',
        `Campaign: ${payload.campaignId}`,
    ];
    return truncate(lines.join('\n'), 4900);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) {
        return {};
    }
    try {
        const parsed = JSON.parse(text);
        return isObject(parsed) ? parsed : { value: parsed };
    } catch {
        return { raw: text };
    }
}

function throwApiError(label: string, status: number, statusText: string, details: unknown): never {
    const detailText = typeof details === 'string'
        ? details
        : JSON.stringify(details);
    const error = new Error(`${label} failed with ${status} ${statusText}: ${truncate(detailText, 800)}`) as Error & {
        status?: number;
        statusCode?: number;
    };
    error.status = status;
    error.statusCode = status;
    throw error;
}

async function postJsonWithAuth(
    url: string,
    token: string,
    body: Record<string, unknown>,
    label: string,
    options: { idempotencyKey?: string; allowRetries?: boolean } = {},
): Promise<Record<string, unknown>> {
    const { idempotencyKey, allowRetries = false } = options;
    const doFetch = async () => {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
        const parsed = await parseJsonResponse(response);
        if (!response.ok) {
            throwApiError(label, response.status, response.statusText, parsed);
        }
        return parsed;
    };

    if (!allowRetries) {
        return doFetch();
    }

    return withHttpRetry(doFetch, label, { maxRetries: 1, baseDelayMs: 750 });
}

async function postMultipartWithAuth(
    url: string,
    token: string,
    metadata: Record<string, unknown>,
    mediaBuffer: Buffer,
    mediaContentType: string,
    label: string,
): Promise<Record<string, unknown>> {
    const boundary = `----domainempire-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

    const metadataPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        'utf8',
    );
    const mediaHeaderPart = Buffer.from(
        `--${boundary}\r\nContent-Type: ${mediaContentType}\r\n\r\n`,
        'utf8',
    );
    const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const bodyBuffer = Buffer.concat([metadataPart, mediaHeaderPart, mediaBuffer, footerPart]);

    return withHttpRetry(
        async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Content-Length': String(bodyBuffer.length),
                },
                body: bodyBuffer,
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
            });
            const parsed = await parseJsonResponse(response);
            if (!response.ok) {
                throwApiError(label, response.status, response.statusText, parsed);
            }
            return parsed;
        },
        label,
        { maxRetries: 1, baseDelayMs: 750 },
    );
}

async function publishPinterest(
    payload: GrowthPublishPayload,
    options: GrowthPublishOptions,
): Promise<GrowthPublishResult> {
    if (isMockEnabled()) {
        return {
            externalPostId: buildMockId('pinterest', payload.creativeHash),
            status: 'published',
            metadata: {
                mode: 'mock',
                destinationUrl: payload.destinationUrl,
            },
        };
    }

    if (!payload.assetUrl) {
        throw new Error('Pinterest publish requires assetUrl in live mode');
    }

    const token = options.credential?.accessToken || assertEnv('PINTEREST_ACCESS_TOKEN');
    const boardId = options.credential?.pinterestBoardId || assertEnv('PINTEREST_BOARD_ID');
    const apiBase = (process.env.PINTEREST_API_BASE || 'https://api.pinterest.com/v5').replace(/\/$/, '');

    const requestBody: Record<string, unknown> = {
        board_id: boardId,
        title: buildPinterestTitle(payload),
        description: truncate(normalizeWhitespace(payload.copy), 500),
        link: payload.destinationUrl,
        alt_text: truncate(`Domain promotion for ${payload.domain}`, 500),
        media_source: {
            source_type: 'image_url',
            url: payload.assetUrl,
        },
    };

    const response = await postJsonWithAuth(
        `${apiBase}/pins`,
        token,
        requestBody,
        'pinterest-publish',
        { idempotencyKey: payload.creativeHash },
    );

    if (typeof response.id !== 'string') {
        console.error('Pinterest publish returned no post id:', {
            creativeHash: payload.creativeHash,
            hasId: 'id' in response,
            errorCode: response.code ?? response.error_code ?? undefined,
            errorMessage: typeof response.message === 'string' ? truncate(response.message, 200) : undefined,
        });
        throw new Error(
            `Missing Pinterest post id for creativeHash=${payload.creativeHash}`,
        );
    }
    const externalPostId = response.id;

    return {
        externalPostId,
        status: 'published',
        metadata: {
            mode: 'live',
            boardId,
            credentialSource: options.credential ? 'stored' : 'env',
            destinationUrl: payload.destinationUrl,
            assetUrl: payload.assetUrl,
            apiBase,
        },
    };
}

async function publishYouTubeShort(
    payload: GrowthPublishPayload,
    options: GrowthPublishOptions,
): Promise<GrowthPublishResult> {
    if (isMockEnabled()) {
        return {
            externalPostId: buildMockId('youtube_shorts', payload.creativeHash),
            status: 'published',
            metadata: {
                mode: 'mock',
                destinationUrl: payload.destinationUrl,
            },
        };
    }

    if (!payload.assetUrl) {
        throw new Error('YouTube Shorts publish requires assetUrl in live mode');
    }

    const token = options.credential?.accessToken || assertEnv('YOUTUBE_ACCESS_TOKEN');
    const channelId = options.credential?.youtubeChannelId || assertEnv('YOUTUBE_CHANNEL_ID');
    const privacyStatus = (process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS || 'private').toLowerCase();
    const categoryId = process.env.YOUTUBE_DEFAULT_CATEGORY_ID || '22';

    const { buffer, contentType, finalUrl } = await safeDownloadToBuffer(payload.assetUrl, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxBytes: DEFAULT_MAX_VIDEO_BYTES,
        allowedContentTypePrefixes: ['video/'],
    });

    const metadata = {
        snippet: {
            title: buildYouTubeTitle(payload),
            description: buildYouTubeDescription(payload),
            tags: [
                payload.domain.replace(/\./g, ''),
                'domainempire',
                'shorts',
            ],
            categoryId,
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en',
        },
        status: {
            privacyStatus: privacyStatus === 'public' || privacyStatus === 'unlisted' ? privacyStatus : 'private',
            selfDeclaredMadeForKids: false,
        },
    };

    const response = await postMultipartWithAuth(
        'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart',
        token,
        metadata,
        buffer,
        contentType,
        'youtube-publish',
    );

    if (typeof response.id !== 'string') {
        const errorInfo = isObject(response.error) ? response.error : {};
        console.error('YouTube upload returned no video id:', {
            creativeHash: payload.creativeHash,
            hasId: 'id' in response,
            errorCode: (errorInfo as Record<string, unknown>).code ?? undefined,
            errorMessage: typeof (errorInfo as Record<string, unknown>).message === 'string'
                ? truncate((errorInfo as Record<string, unknown>).message as string, 200)
                : undefined,
        });
        throw new Error(
            `Missing YouTube video id for creativeHash=${payload.creativeHash}`,
        );
    }
    const externalPostId = response.id;

    return {
        externalPostId,
        status: metadata.status.privacyStatus === 'public' ? 'published' : 'queued',
        metadata: {
            mode: 'live',
            channelId,
            credentialSource: options.credential ? 'stored' : 'env',
            destinationUrl: payload.destinationUrl,
            assetUrl: finalUrl,
            bytesUploaded: buffer.length,
            privacyStatus: metadata.status.privacyStatus,
        },
    };
}

export async function publishToGrowthChannel(
    channel: GrowthPublishChannel,
    payload: GrowthPublishPayload,
    options: GrowthPublishOptions = {},
): Promise<GrowthPublishResult> {
    if (channel === 'pinterest') {
        return publishPinterest(payload, options);
    }
    if (channel === 'youtube_shorts') {
        return publishYouTubeShort(payload, options);
    }
    throw new Error(`Unsupported growth channel: ${channel}`);
}
