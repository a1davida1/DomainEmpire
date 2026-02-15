import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db, mediaModerationEvents } from '@/lib/db';

export type MediaModerationEventType =
    | 'created'
    | 'assigned'
    | 'escalated'
    | 'approved'
    | 'rejected'
    | 'needs_changes'
    | 'cancelled'
    | 'exported';

type WritableDb = Pick<typeof db, 'select' | 'insert'> & {
    execute?: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

function normalizePayload(payload: unknown): Record<string, unknown> {
    if (payload === undefined || payload === null) {
        return {};
    }
    if (Array.isArray(payload)) {
        throw new TypeError(`normalizePayload: expected plain object but received array`);
    }
    if (typeof payload !== 'object') {
        throw new TypeError(`normalizePayload: expected plain object but received ${typeof payload}`);
    }
    return payload as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
    return `{${entries.join(',')}}`;
}

function lengthPrefixed(digest: ReturnType<typeof createHash>, field: string): void {
    const byteLength = Buffer.byteLength(field, 'utf8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(byteLength, 0);
    digest.update(lengthBuf);
    digest.update(field, 'utf8');
}

function computeEventHash(input: {
    prevEventHash: string | null;
    userId: string;
    taskId: string;
    assetId: string;
    eventType: MediaModerationEventType;
    createdAtIso: string;
    payload: Record<string, unknown>;
}): string {
    const digest = createHash('sha256');
    lengthPrefixed(digest, input.prevEventHash ?? '');
    lengthPrefixed(digest, input.userId);
    lengthPrefixed(digest, input.taskId);
    lengthPrefixed(digest, input.assetId);
    lengthPrefixed(digest, input.eventType);
    lengthPrefixed(digest, input.createdAtIso);
    lengthPrefixed(digest, stableStringify(input.payload));
    return digest.digest('hex');
}

const MAX_APPEND_RETRIES = 3;

export async function appendMediaModerationEvent(
    tx: WritableDb,
    input: {
        userId: string;
        taskId: string;
        assetId: string;
        actorId?: string | null;
        eventType: MediaModerationEventType;
        payload?: Record<string, unknown>;
        createdAt?: Date;
    },
) {
    for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt += 1) {
        if (attempt === 0 && typeof tx.execute === 'function') {
            try {
                await tx.execute(sql`SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
            } catch {
                // Ignore when transaction isolation cannot be changed (e.g., prior statements already executed).
            }
        }

        const [lastEvent] = await tx.select({
            eventHash: mediaModerationEvents.eventHash,
        })
            .from(mediaModerationEvents)
            .where(eq(mediaModerationEvents.taskId, input.taskId))
            .orderBy(desc(mediaModerationEvents.createdAt), desc(mediaModerationEvents.eventHash))
            .limit(1);

        const createdAtDate = input.createdAt ?? new Date();
        const createdAtIso = createdAtDate.toISOString();
        const payload = normalizePayload(input.payload);
        const prevEventHash = lastEvent?.eventHash ?? null;
        const eventHash = computeEventHash({
            prevEventHash,
            userId: input.userId,
            taskId: input.taskId,
            assetId: input.assetId,
            eventType: input.eventType,
            createdAtIso,
            payload,
        });

        try {
            const [event] = await tx.insert(mediaModerationEvents)
                .values({
                    userId: input.userId,
                    taskId: input.taskId,
                    assetId: input.assetId,
                    actorId: input.actorId ?? null,
                    eventType: input.eventType,
                    payload,
                    prevEventHash,
                    eventHash,
                    createdAt: createdAtDate,
                })
                .returning();

            return event;
        } catch (error: unknown) {
            const errorCode = error instanceof Error && 'code' in error
                ? (error as Record<string, unknown>).code
                : null;
            const isRetryable = errorCode === '23505' || errorCode === '40001';
            if (isRetryable && attempt < MAX_APPEND_RETRIES - 1) {
                continue;
            }
            throw error;
        }
    }

    throw new Error(`appendMediaModerationEvent: failed after ${MAX_APPEND_RETRIES} retries for task ${input.taskId}`);
}

export function verifyMediaModerationEventChain(
    events: Array<{
        userId: string;
        taskId: string;
        assetId: string;
        eventType: MediaModerationEventType;
        payload: Record<string, unknown>;
        prevEventHash: string | null;
        eventHash: string;
        createdAt: Date | string | null;
    }>,
) {
    let expectedPrev: string | null = null;
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const createdAtRaw = event.createdAt instanceof Date
            ? event.createdAt
            : new Date(event.createdAt ?? '');
        const createdAtIso = Number.isFinite(createdAtRaw.getTime())
            ? createdAtRaw.toISOString()
            : new Date(0).toISOString();
        const payload = normalizePayload(event.payload);
        const recomputedHash = computeEventHash({
            prevEventHash: event.prevEventHash ?? null,
            userId: event.userId,
            taskId: event.taskId,
            assetId: event.assetId,
            eventType: event.eventType,
            createdAtIso,
            payload,
        });
        if ((event.prevEventHash ?? null) !== expectedPrev) {
            return {
                valid: false,
                firstInvalidIndex: index,
                reason: 'prev_hash_mismatch',
                latestHash: events[index - 1]?.eventHash ?? null,
            };
        }
        if (recomputedHash !== event.eventHash) {
            return {
                valid: false,
                firstInvalidIndex: index,
                reason: 'event_hash_mismatch',
                latestHash: events[index - 1]?.eventHash ?? null,
            };
        }
        expectedPrev = event.eventHash;
    }

    return {
        valid: true,
        firstInvalidIndex: null,
        reason: null,
        latestHash: events.length > 0 ? events[events.length - 1].eventHash : null,
    };
}
