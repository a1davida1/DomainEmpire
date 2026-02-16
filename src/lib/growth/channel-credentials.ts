import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { db, growthChannelCredentials } from '@/lib/db';
import type { GrowthPublishChannel, GrowthPublishCredential } from '@/lib/growth/publishers';
import { decryptSecret, encryptSecret } from '@/lib/security/encryption';
import { withHttpRetry } from '@/lib/tpilot/core/retry';
import { createNotification } from '@/lib/notifications';

export interface UpsertGrowthChannelCredentialInput {
    userId: string;
    channel: GrowthPublishChannel;
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
    scopes?: string[];
    providerAccountId?: string | null;
    metadata?: Record<string, unknown>;
}

export interface GrowthChannelCredentialStatus {
    userId: string;
    channel: GrowthPublishChannel;
    configured: boolean;
    revoked: boolean;
    accessTokenExpiresAt: Date | null;
    refreshTokenExpiresAt: Date | null;
    hasRefreshToken: boolean;
    scopes: string[];
    providerAccountId: string | null;
    metadata: Record<string, unknown>;
    updatedAt: Date | null;
}

export interface RefreshGrowthChannelCredentialResult {
    refreshed: boolean;
    credential: GrowthChannelCredentialStatus;
}

export interface GrowthCredentialRefreshAuditSummary {
    due: number;
    refreshed: number;
    unchanged: number;
    failed: number;
    revoked: number;
}

interface OAuthTokenRefreshResult {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt: Date | null;
    scopes?: string[];
    providerAccountId?: string | null;
}

const REFRESH_TIMEOUT_MS = Number.isFinite(Number.parseInt(process.env.GROWTH_CREDENTIAL_REFRESH_TIMEOUT_MS || '', 10))
    ? Math.max(5_000, Number.parseInt(process.env.GROWTH_CREDENTIAL_REFRESH_TIMEOUT_MS || '', 10))
    : 15_000;
const REFRESH_AUDIT_LOOKAHEAD_MS = Number.isFinite(Number.parseInt(process.env.GROWTH_CREDENTIAL_AUDIT_LOOKAHEAD_MS || '', 10))
    ? Math.max(5 * 60 * 1000, Number.parseInt(process.env.GROWTH_CREDENTIAL_AUDIT_LOOKAHEAD_MS || '', 10))
    : 6 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asPositiveNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}

function parseScopes(raw: unknown): string[] | undefined {
    const asString = asTrimmedString(raw);
    if (!asString) return undefined;
    const scopes = asString
        .split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);
    return scopes.length > 0 ? scopes : undefined;
}

function normalizeToken(token: string): string {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
        throw new Error('accessToken cannot be empty');
    }
    return trimmed;
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata || Array.isArray(metadata)) {
        return {};
    }
    return metadata;
}

function parseOptionalDate(value?: Date | string | null): Date | null {
    if (!value) return null;
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) {
            return parsed;
        }
    }
    return null;
}

function toCredentialStatus(
    row: typeof growthChannelCredentials.$inferSelect,
): GrowthChannelCredentialStatus {
    return {
        userId: row.userId,
        channel: row.channel,
        configured: true,
        revoked: row.revokedAt !== null,
        accessTokenExpiresAt: row.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: row.refreshTokenExpiresAt ?? null,
        hasRefreshToken: Boolean(row.encryptedRefreshToken),
        scopes: row.scopes ?? [],
        providerAccountId: row.providerAccountId ?? null,
        metadata: row.metadata ?? {},
        updatedAt: row.updatedAt ?? null,
    };
}

function isExpiring(expiresAt: Date | null | undefined): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() <= Date.now() + 30_000;
}

function assertProviderEnv(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return isRecord(parsed) ? parsed : { value: parsed };
    } catch {
        return { raw: text };
    }
}

function throwRefreshError(
    channel: GrowthPublishChannel,
    status: number,
    details: Record<string, unknown>,
): never {
    const error = new Error(
        `Failed to refresh ${channel} token (${status})`,
    ) as Error & { status?: number; statusCode?: number; details?: Record<string, unknown> };
    error.status = status;
    error.statusCode = status;
    error.details = details;
    throw error;
}

async function postTokenRefresh(
    channel: GrowthPublishChannel,
    tokenUrl: string,
    body: URLSearchParams,
): Promise<Record<string, unknown>> {
    return withHttpRetry(async () => {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });
        const parsed = await parseJsonResponse(response);
        if (!response.ok) {
            throwRefreshError(channel, response.status, parsed);
        }
        return parsed;
    }, `oauth-refresh-${channel}`, {
        maxRetries: 2,
        baseDelayMs: 1_000,
    });
}

function parseOAuthRefreshResult(
    channel: GrowthPublishChannel,
    payload: Record<string, unknown>,
): OAuthTokenRefreshResult {
    const accessToken = asTrimmedString(payload.access_token);
    if (!accessToken) {
        throw new Error(`Invalid ${channel} token refresh response: missing access_token`);
    }

    const refreshToken = asTrimmedString(payload.refresh_token);
    const expiresIn = asPositiveNumber(payload.expires_in);
    const expiresAt = expiresIn
        ? new Date(Date.now() + (expiresIn * 1000))
        : null;

    const scopes = parseScopes(payload.scope);
    const providerAccountId = asTrimmedString(payload.user_id)
        || asTrimmedString(payload.account_id)
        || asTrimmedString(payload.channel_id)
        || null;

    return {
        accessToken,
        refreshToken,
        expiresAt,
        scopes,
        providerAccountId,
    };
}

async function refreshAccessToken(
    channel: GrowthPublishChannel,
    refreshToken: string,
): Promise<OAuthTokenRefreshResult> {
    switch (channel) {
        case 'youtube_shorts': {
            const clientId = assertProviderEnv('YOUTUBE_CLIENT_ID');
            const clientSecret = assertProviderEnv('YOUTUBE_CLIENT_SECRET');
            const tokenUrl = process.env.YOUTUBE_OAUTH_TOKEN_URL?.trim()
                || 'https://oauth2.googleapis.com/token';
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            const payload = await postTokenRefresh(channel, tokenUrl, body);
            return parseOAuthRefreshResult(channel, payload);
        }
        case 'pinterest': {
            const clientId = assertProviderEnv('PINTEREST_CLIENT_ID');
            const clientSecret = assertProviderEnv('PINTEREST_CLIENT_SECRET');
            const tokenUrl = process.env.PINTEREST_OAUTH_TOKEN_URL?.trim()
                || 'https://api.pinterest.com/v5/oauth/token';
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            const payload = await postTokenRefresh(channel, tokenUrl, body);
            return parseOAuthRefreshResult(channel, payload);
        }
        default: {
            const _exhaustive: never = channel;
            throw new Error(`Unsupported growth channel for token refresh: ${_exhaustive}`);
        }
    }
}

async function writeRefreshFailureSignal(
    userId: string,
    channel: GrowthPublishChannel,
    message: string,
): Promise<void> {
    const userTag = userId.slice(0, 8);
    await createNotification({
        type: 'info',
        severity: 'warning',
        title: `Growth credential refresh failed (${channel}, ${userTag})`,
        message,
        actionUrl: '/dashboard/monitoring',
    });
}

function buildPublishCredential(
    row: typeof growthChannelCredentials.$inferSelect,
    accessTokenOverride?: string,
): GrowthPublishCredential {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const accessToken = accessTokenOverride ?? decryptSecret(row.encryptedAccessToken);
    return {
        accessToken,
        pinterestBoardId: readMetadataString(metadata, 'boardId'),
        youtubeChannelId: readMetadataString(metadata, 'channelId'),
    };
}

export async function upsertGrowthChannelCredential(
    input: UpsertGrowthChannelCredentialInput,
): Promise<GrowthChannelCredentialStatus> {
    const accessToken = normalizeToken(input.accessToken);
    const refreshToken = input.refreshToken?.trim() ? input.refreshToken.trim() : null;
    const metadata = normalizeMetadata(input.metadata);
    const now = new Date();

    const [row] = await db
        .insert(growthChannelCredentials)
        .values({
            userId: input.userId,
            channel: input.channel,
            encryptedAccessToken: encryptSecret(accessToken),
            encryptedRefreshToken: refreshToken ? encryptSecret(refreshToken) : null,
            accessTokenExpiresAt: parseOptionalDate(input.accessTokenExpiresAt),
            refreshTokenExpiresAt: parseOptionalDate(input.refreshTokenExpiresAt),
            scopes: input.scopes ?? [],
            providerAccountId: input.providerAccountId ?? null,
            metadata,
            revokedAt: null,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [growthChannelCredentials.userId, growthChannelCredentials.channel],
            set: {
                encryptedAccessToken: encryptSecret(accessToken),
                encryptedRefreshToken: refreshToken ? encryptSecret(refreshToken) : null,
                accessTokenExpiresAt: parseOptionalDate(input.accessTokenExpiresAt),
                refreshTokenExpiresAt: parseOptionalDate(input.refreshTokenExpiresAt),
                scopes: input.scopes ?? [],
                providerAccountId: input.providerAccountId ?? null,
                metadata,
                revokedAt: null,
                updatedAt: now,
            },
        })
        .returning();

    if (!row) {
        throw new Error('Failed to persist growth channel credential');
    }

    return toCredentialStatus(row);
}

export async function revokeGrowthChannelCredential(
    userId: string,
    channel: GrowthPublishChannel,
): Promise<boolean> {
    const rows = await db
        .update(growthChannelCredentials)
        .set({
            revokedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(and(
            eq(growthChannelCredentials.userId, userId),
            eq(growthChannelCredentials.channel, channel),
            isNull(growthChannelCredentials.revokedAt),
        ))
        .returning({ id: growthChannelCredentials.id });

    return rows.length > 0;
}

export async function listGrowthChannelCredentialStatus(
    userId: string,
): Promise<GrowthChannelCredentialStatus[]> {
    const rows = await db
        .select()
        .from(growthChannelCredentials)
        .where(eq(growthChannelCredentials.userId, userId))
        .orderBy(desc(growthChannelCredentials.updatedAt));

    return rows.map(toCredentialStatus);
}

export async function getGrowthChannelCredentialStatus(
    userId: string,
    channel: GrowthPublishChannel,
): Promise<GrowthChannelCredentialStatus | null> {
    const rows = await db
        .select()
        .from(growthChannelCredentials)
        .where(and(
            eq(growthChannelCredentials.userId, userId),
            eq(growthChannelCredentials.channel, channel),
        ))
        .orderBy(desc(growthChannelCredentials.updatedAt))
        .limit(1);
    const row = rows[0];
    return row ? toCredentialStatus(row) : null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function refreshCredentialRow(
    row: typeof growthChannelCredentials.$inferSelect,
): Promise<typeof growthChannelCredentials.$inferSelect | null> {
    if (!row.encryptedRefreshToken) {
        throw new Error(`Cannot refresh ${row.channel}: missing refresh token`);
    }

    const refreshToken = decryptSecret(row.encryptedRefreshToken);
    const refreshed = await refreshAccessToken(row.channel, refreshToken);
    const now = new Date();
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const mergedMetadata: Record<string, unknown> = {
        ...metadata,
        oauthLastRefreshAt: now.toISOString(),
        oauthLastRefreshStatus: 'success',
    };

    const [updated] = await db.update(growthChannelCredentials).set({
        encryptedAccessToken: encryptSecret(refreshed.accessToken),
        encryptedRefreshToken: refreshed.refreshToken
            ? encryptSecret(refreshed.refreshToken)
            : row.encryptedRefreshToken,
        accessTokenExpiresAt: refreshed.expiresAt ?? row.accessTokenExpiresAt,
        scopes: refreshed.scopes ?? row.scopes,
        providerAccountId: refreshed.providerAccountId ?? row.providerAccountId,
        metadata: mergedMetadata,
        revokedAt: null,
        lastRefreshAt: now,
        lastValidatedAt: now,
        updatedAt: now,
    }).where(eq(growthChannelCredentials.id, row.id)).returning();

    return updated ?? null;
}

export async function refreshGrowthChannelCredential(
    userId: string,
    channel: GrowthPublishChannel,
    options: { force?: boolean } = {},
): Promise<RefreshGrowthChannelCredentialResult | null> {
    const rows = await db
        .select()
        .from(growthChannelCredentials)
        .where(and(
            eq(growthChannelCredentials.userId, userId),
            eq(growthChannelCredentials.channel, channel),
            isNull(growthChannelCredentials.revokedAt),
        ))
        .orderBy(desc(growthChannelCredentials.updatedAt))
        .limit(1);
    const row = rows[0];
    if (!row) {
        return null;
    }

    const shouldRefresh = options.force || isExpiring(row.accessTokenExpiresAt ?? null);
    if (!shouldRefresh) {
        return {
            refreshed: false,
            credential: toCredentialStatus(row),
        };
    }

    try {
        const refreshed = await refreshCredentialRow(row);
        if (!refreshed) {
            throw new Error(`Failed to update refreshed credential for ${channel}`);
        }
        return {
            refreshed: true,
            credential: toCredentialStatus(refreshed),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = (
            typeof error === 'object'
            && error !== null
            && 'statusCode' in error
            && typeof (error as { statusCode?: unknown }).statusCode === 'number'
        )
            ? (error as { statusCode: number }).statusCode
            : null;
        const now = new Date();
        const metadata = isRecord(row.metadata) ? row.metadata : {};
        const mergedMetadata: Record<string, unknown> = {
            ...metadata,
            oauthLastRefreshAt: now.toISOString(),
            oauthLastRefreshStatus: 'failed',
            oauthLastRefreshError: errorMessage,
        };

        const shouldRevoke = statusCode === 400 || statusCode === 401;
        await db.update(growthChannelCredentials).set({
            metadata: mergedMetadata,
            revokedAt: shouldRevoke ? now : row.revokedAt,
            updatedAt: now,
        }).where(eq(growthChannelCredentials.id, row.id)).returning();

        await writeRefreshFailureSignal(
            userId,
            channel,
            shouldRevoke
                ? `Credential was revoked after refresh failure (${channel}): ${errorMessage}`
                : `Credential refresh failed (${channel}): ${errorMessage}`,
        );

        throw error;
    }
}

export async function resolveGrowthPublishCredential(
    userId: string | null | undefined,
    channel: GrowthPublishChannel,
): Promise<GrowthPublishCredential | null> {
    if (!userId) {
        return null;
    }

    const rows = await db
        .select()
        .from(growthChannelCredentials)
        .where(and(
            eq(growthChannelCredentials.userId, userId),
            eq(growthChannelCredentials.channel, channel),
            isNull(growthChannelCredentials.revokedAt),
        ))
        .orderBy(desc(growthChannelCredentials.updatedAt))
        .limit(1);
    const row = rows[0];
    if (!row) {
        return null;
    }

    if (isExpiring(row.accessTokenExpiresAt ?? null)) {
        try {
            const refreshed = await refreshGrowthChannelCredential(userId, channel, { force: true });
            if (refreshed?.credential && !refreshed.credential.revoked) {
                const latestRows = await db
                    .select()
                    .from(growthChannelCredentials)
                    .where(and(
                        eq(growthChannelCredentials.userId, userId),
                        eq(growthChannelCredentials.channel, channel),
                        isNull(growthChannelCredentials.revokedAt),
                    ))
                    .orderBy(desc(growthChannelCredentials.updatedAt))
                    .limit(1);
                const latest = latestRows[0];
                if (latest) {
                    return buildPublishCredential(latest);
                }
            }
        } catch (refreshError) {
            console.error(`Growth credential refresh failed for ${channel}:`, refreshError);
            const expiresAt = row.accessTokenExpiresAt ?? null;
            if (expiresAt && expiresAt.getTime() > Date.now()) {
                return buildPublishCredential(row);
            }
        }
        return null;
    }

    return buildPublishCredential(row);
}

export async function refreshExpiringGrowthCredentialsAudit(
    options: { limit?: number; lookaheadMs?: number } = {},
): Promise<GrowthCredentialRefreshAuditSummary> {
    const limit = Number.isFinite(options.limit)
        ? Math.max(1, Math.floor(options.limit as number))
        : 50;
    const lookaheadMs = Number.isFinite(options.lookaheadMs)
        ? Math.max(5 * 60 * 1000, Math.floor(options.lookaheadMs as number))
        : REFRESH_AUDIT_LOOKAHEAD_MS;
    const cutoff = new Date(Date.now() + lookaheadMs);

    const rows = await db.select({
        userId: growthChannelCredentials.userId,
        channel: growthChannelCredentials.channel,
    }).from(growthChannelCredentials).where(and(
        isNull(growthChannelCredentials.revokedAt),
        lte(growthChannelCredentials.accessTokenExpiresAt, cutoff),
    )).limit(limit);

    const summary: GrowthCredentialRefreshAuditSummary = {
        due: rows.length,
        refreshed: 0,
        unchanged: 0,
        failed: 0,
        revoked: 0,
    };

    for (const row of rows) {
        try {
            const result = await refreshGrowthChannelCredential(row.userId, row.channel, { force: true });
            if (!result || result.credential.revoked) {
                summary.revoked += 1;
                continue;
            }
            if (result.refreshed) {
                summary.refreshed += 1;
            } else {
                summary.unchanged += 1;
            }
        } catch {
            const status = await getGrowthChannelCredentialStatus(row.userId, row.channel);
            if (status?.revoked) {
                summary.revoked += 1;
            } else {
                summary.failed += 1;
            }
        }
    }

    return summary;
}

export async function countActiveGrowthChannelCredentials(
    userId: string,
    channel?: GrowthPublishChannel,
): Promise<number> {
    const conditions = [
        eq(growthChannelCredentials.userId, userId),
        isNull(growthChannelCredentials.revokedAt),
    ];
    if (channel) {
        conditions.push(eq(growthChannelCredentials.channel, channel));
    }

    const rows = await db
        .select({ id: growthChannelCredentials.id })
        .from(growthChannelCredentials)
        .where(and(...conditions));

    return rows.length;
}

export async function revokeGrowthCredentialsForReconnect(
    userId: string,
    channel?: GrowthPublishChannel,
): Promise<number> {
    const conditions = [
        eq(growthChannelCredentials.userId, userId),
        isNull(growthChannelCredentials.revokedAt),
    ];
    if (channel) {
        conditions.push(eq(growthChannelCredentials.channel, channel));
    }

    const rows = await db
        .update(growthChannelCredentials)
        .set({
            revokedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning({ id: growthChannelCredentials.id });

    return rows.length;
}
