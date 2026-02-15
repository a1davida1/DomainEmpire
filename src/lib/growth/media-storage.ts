import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

export type GrowthMediaStorageProvider = 'local' | 's3_compatible';
export type GrowthMediaAssetType = 'image' | 'video' | 'script' | 'voiceover';

export interface StoreGrowthMediaInput {
    userId: string;
    assetType: GrowthMediaAssetType;
    filename: string;
    contentType: string;
    buffer: Buffer;
}

export interface StoreGrowthMediaResult {
    provider: GrowthMediaStorageProvider;
    key: string;
    url: string;
    bytes: number;
    contentType: string;
    etag?: string | null;
}

export interface DeleteGrowthMediaInput {
    key: string;
    provider?: GrowthMediaStorageProvider;
}

interface S3Config {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string | null;
    publicBaseUrl?: string | null;
}

const DEFAULT_LOCAL_PUBLIC_BASE = '/uploads/growth';
const DEFAULT_LOCAL_ROOT = join(process.cwd(), 'public', 'uploads', 'growth');

const EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/json': '.json',
};

function resolveProvider(): GrowthMediaStorageProvider {
    const raw = (process.env.GROWTH_MEDIA_STORAGE_PROVIDER || 'local').trim().toLowerCase();
    if (raw === 's3' || raw === 's3_compatible' || raw === 'r2') {
        return 's3_compatible';
    }
    return 'local';
}

function sanitizePathSegment(value: string): string {
    const cleaned = value
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return cleaned.length > 0 ? cleaned : 'unknown';
}

function normalizePublicBase(base: string): string {
    const trimmed = base.trim();
    if (trimmed.length === 0) return DEFAULT_LOCAL_PUBLIC_BASE;
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.replace(/\/+$/, '');
}

function inferExtension(filename: string, contentType: string, assetType: GrowthMediaAssetType): string {
    const fromName = extname(filename || '').toLowerCase();
    if (/^\.[a-z0-9]{1,10}$/i.test(fromName)) {
        return fromName;
    }

    const normalizedType = contentType.split(';')[0].trim().toLowerCase();
    if (normalizedType && EXTENSION_BY_MIME[normalizedType]) {
        return EXTENSION_BY_MIME[normalizedType];
    }

    if (assetType === 'image') return '.jpg';
    if (assetType === 'video') return '.mp4';
    if (assetType === 'voiceover') return '.mp3';
    return '.txt';
}

function buildObjectKey(
    userId: string,
    assetType: GrowthMediaAssetType,
    filename: string,
    contentType: string,
): string {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const safeUserId = sanitizePathSegment(userId).slice(0, 64);
    const extension = inferExtension(filename, contentType, assetType);
    const objectId = randomUUID();

    return `${safeUserId}/${assetType}/${year}/${month}/${day}/${objectId}${extension}`;
}

async function storeLocal(input: StoreGrowthMediaInput): Promise<StoreGrowthMediaResult> {
    const objectKey = buildObjectKey(input.userId, input.assetType, input.filename, input.contentType);
    const localRoot = process.env.GROWTH_MEDIA_LOCAL_DIR?.trim() || DEFAULT_LOCAL_ROOT;
    const publicBase = normalizePublicBase(process.env.GROWTH_MEDIA_LOCAL_PUBLIC_BASE || DEFAULT_LOCAL_PUBLIC_BASE);
    const absolutePath = join(localRoot, ...objectKey.split('/'));

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    return {
        provider: 'local',
        key: objectKey,
        url: `${publicBase}/${objectKey}`,
        bytes: input.buffer.length,
        contentType: input.contentType,
        etag: createHash('md5').update(input.buffer).digest('hex'),
    };
}

function resolveLocalAbsolutePath(objectKey: string): string {
    const normalizedKey = objectKey.trim().replace(/^\/+/, '');
    if (normalizedKey.length === 0 || normalizedKey.includes('..')) {
        throw new Error('Invalid media storage key for local provider');
    }
    const localRoot = process.env.GROWTH_MEDIA_LOCAL_DIR?.trim() || DEFAULT_LOCAL_ROOT;
    return join(localRoot, ...normalizedKey.split('/'));
}

async function deleteLocal(objectKey: string): Promise<void> {
    const absolutePath = resolveLocalAbsolutePath(objectKey);
    try {
        await unlink(absolutePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}

function requireS3Config(): S3Config {
    const endpoint = process.env.GROWTH_MEDIA_S3_ENDPOINT?.trim();
    const bucket = process.env.GROWTH_MEDIA_S3_BUCKET?.trim();
    const region = (process.env.GROWTH_MEDIA_S3_REGION || 'auto').trim();
    const accessKeyId = process.env.GROWTH_MEDIA_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.GROWTH_MEDIA_S3_SECRET_ACCESS_KEY?.trim();
    const sessionToken = process.env.GROWTH_MEDIA_S3_SESSION_TOKEN?.trim() || null;
    const publicBaseUrl = process.env.GROWTH_MEDIA_S3_PUBLIC_BASE_URL?.trim() || null;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
        throw new Error(
            'Missing S3 storage configuration. Set GROWTH_MEDIA_S3_ENDPOINT, GROWTH_MEDIA_S3_BUCKET, GROWTH_MEDIA_S3_ACCESS_KEY_ID, and GROWTH_MEDIA_S3_SECRET_ACCESS_KEY.',
        );
    }

    return {
        endpoint: endpoint.replace(/\/+$/, ''),
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        publicBaseUrl,
    };
}

function sha256Hex(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
    return createHmac('sha256', key).update(value, 'utf8').digest();
}

function encodeRfc3986(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatAmzDate(now: Date): string {
    return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function truncate(value: string, max = 400): string {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 3))}...`;
}

async function storeS3Compatible(input: StoreGrowthMediaInput): Promise<StoreGrowthMediaResult> {
    const config = requireS3Config();
    const objectKey = buildObjectKey(input.userId, input.assetType, input.filename, input.contentType);
    const encodedKey = objectKey.split('/').map(encodeRfc3986).join('/');
    const requestUrl = new URL(`${config.endpoint}/${encodeRfc3986(config.bucket)}/${encodedKey}`);
    const payloadHash = sha256Hex(input.buffer);
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;

    const signedHeaderEntries: Array<[string, string]> = [
        ['host', requestUrl.host],
        ['x-amz-content-sha256', payloadHash],
        ['x-amz-date', amzDate],
    ];
    if (config.sessionToken) {
        signedHeaderEntries.push(['x-amz-security-token', config.sessionToken]);
    }
    const canonicalHeaders = `${signedHeaderEntries
        .map(([name, value]) => `${name}:${value}\n`)
        .join('')}`;
    const signedHeaders = signedHeaderEntries.map(([name]) => name).join(';');
    const canonicalRequest = [
        'PUT',
        requestUrl.pathname,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = hmac(
        hmac(
            hmac(
                hmac(`AWS4${config.secretAccessKey}`, dateStamp),
                config.region,
            ),
            's3',
        ),
        'aws4_request',
    );
    const signature = createHmac('sha256', signingKey)
        .update(stringToSign, 'utf8')
        .digest('hex');
    const authorization = [
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
    ].join(', ');

    const requestHeaders: Record<string, string> = {
        Authorization: authorization,
        'Content-Type': input.contentType,
        'Content-Length': String(input.buffer.length),
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate,
        Host: requestUrl.host,
    };
    if (config.sessionToken) {
        requestHeaders['X-Amz-Security-Token'] = config.sessionToken;
    }

    const uploadTimeoutMs = Number.parseInt(process.env.GROWTH_MEDIA_S3_UPLOAD_TIMEOUT_MS || '', 10);
    const timeoutMs = Number.isFinite(uploadTimeoutMs) && uploadTimeoutMs > 0 ? uploadTimeoutMs : 120_000;
    let response: Response;
    try {
        response = await fetch(requestUrl, {
            method: 'PUT',
            headers: requestHeaders,
            body: new Uint8Array(input.buffer),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new Error(`S3-compatible upload timed out after ${timeoutMs}ms`);
        }
        throw err;
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `S3-compatible upload failed (${response.status} ${response.statusText}): ${truncate(body)}`,
        );
    }

    const defaultBaseUrl = `${config.endpoint}/${encodeRfc3986(config.bucket)}`;
    const publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, '') || defaultBaseUrl;
    const publicUrl = `${publicBaseUrl}/${encodedKey}`;
    const etagHeader = response.headers.get('etag');

    return {
        provider: 's3_compatible',
        key: objectKey,
        url: publicUrl,
        bytes: input.buffer.length,
        contentType: input.contentType,
        etag: etagHeader ? etagHeader.replaceAll('"', '') : null,
    };
}

async function deleteS3Compatible(objectKey: string): Promise<void> {
    const config = requireS3Config();
    const normalizedKey = objectKey.trim().replace(/^\/+/, '');
    if (normalizedKey.length === 0 || normalizedKey.includes('..')) {
        throw new Error('Invalid media storage key for S3-compatible provider');
    }

    const encodedKey = normalizedKey.split('/').map(encodeRfc3986).join('/');
    const requestUrl = new URL(`${config.endpoint}/${encodeRfc3986(config.bucket)}/${encodedKey}`);
    const payloadHash = sha256Hex('');
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;

    const signedHeaderEntries: Array<[string, string]> = [
        ['host', requestUrl.host],
        ['x-amz-content-sha256', payloadHash],
        ['x-amz-date', amzDate],
    ];
    if (config.sessionToken) {
        signedHeaderEntries.push(['x-amz-security-token', config.sessionToken]);
    }
    const canonicalHeaders = `${signedHeaderEntries
        .map(([name, value]) => `${name}:${value}\n`)
        .join('')}`;
    const signedHeaders = signedHeaderEntries.map(([name]) => name).join(';');
    const canonicalRequest = [
        'DELETE',
        requestUrl.pathname,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = hmac(
        hmac(
            hmac(
                hmac(`AWS4${config.secretAccessKey}`, dateStamp),
                config.region,
            ),
            's3',
        ),
        'aws4_request',
    );
    const signature = createHmac('sha256', signingKey)
        .update(stringToSign, 'utf8')
        .digest('hex');
    const authorization = [
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
    ].join(', ');

    const requestHeaders: Record<string, string> = {
        Authorization: authorization,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate,
        Host: requestUrl.host,
    };
    if (config.sessionToken) {
        requestHeaders['X-Amz-Security-Token'] = config.sessionToken;
    }

    const timeoutMs = Number.isFinite(Number.parseInt(process.env.GROWTH_MEDIA_S3_UPLOAD_TIMEOUT_MS || '', 10))
        ? Math.max(1000, Number.parseInt(process.env.GROWTH_MEDIA_S3_UPLOAD_TIMEOUT_MS || '', 10))
        : 120_000;

    let response: Response;
    try {
        response = await fetch(requestUrl, {
            method: 'DELETE',
            headers: requestHeaders,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new Error(`S3-compatible delete timed out after ${timeoutMs}ms`);
        }
        throw err;
    }

    if (!response.ok && response.status !== 404) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `S3-compatible delete failed (${response.status} ${response.statusText}): ${truncate(body)}`,
        );
    }
}

export async function storeGrowthMedia(input: StoreGrowthMediaInput): Promise<StoreGrowthMediaResult> {
    if (!input.userId) {
        throw new Error('userId is required for media storage');
    }
    if (!input.buffer || input.buffer.length === 0) {
        throw new Error('Cannot store an empty file');
    }

    const provider = resolveProvider();
    if (provider === 's3_compatible') {
        return storeS3Compatible(input);
    }
    return storeLocal(input);
}

export async function deleteGrowthMedia(input: DeleteGrowthMediaInput): Promise<void> {
    const key = input.key?.trim();
    if (!key) {
        throw new Error('key is required for media deletion');
    }

    const provider = input.provider ?? resolveProvider();
    if (provider === 's3_compatible') {
        await deleteS3Compatible(key);
        return;
    }
    await deleteLocal(key);
}
