/**
 * Idempotency key middleware for mutation endpoints.
 *
 * Clients send an `Idempotency-Key` header with a unique value (e.g. UUID).
 * On first request: execute normally, store response keyed by the idempotency key.
 * On duplicate request (same key): return the stored response without re-executing.
 *
 * Keys expire after 24 hours by default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, idempotencyKeys } from '@/lib/db';
import { eq, lt } from 'drizzle-orm';

const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check for an existing idempotency key. If found and not expired, return the cached response.
 * Returns null if the request should proceed normally.
 */
export async function checkIdempotencyKey(request: NextRequest): Promise<NextResponse | null> {
    const key = request.headers.get('Idempotency-Key');
    if (!key) return null;

    // Validate key format (max 255 chars, alphanumeric + hyphens)
    if (key.length > 255 || !/^[\w-]+$/.test(key)) {
        return NextResponse.json(
            { error: 'Invalid Idempotency-Key format' },
            { status: 400 }
        );
    }

    const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, key))
        .limit(1);

    if (existing.length > 0) {
        const record = existing[0];

        // Check if expired
        if (record.expiresAt < new Date()) {
            // Clean up expired key and proceed
            await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
            return null;
        }

        // Verify method and path match (prevent reuse across endpoints)
        const method = request.method;
        const path = request.nextUrl.pathname;
        if (record.method !== method || record.path !== path) {
            return NextResponse.json(
                { error: 'Idempotency-Key already used for a different request' },
                { status: 422 }
            );
        }

        // Return cached response
        if (record.status === 'started') {
            return NextResponse.json(
                { error: 'Request already in progress' },
                { status: 409 }
            );
        }

        try {
            const body = JSON.parse(record.responseBody);
            return NextResponse.json(body, { status: record.statusCode });
        } catch (e) {
            console.error(`[Idempotency] Corrupt cache for key: ${key}, statusCode: ${record.statusCode}. Error:`, e);
            return NextResponse.json({ error: 'Internal Server Error', message: 'Cached response corrupted' }, { status: 500 });
        }
    }

    return null;
}

/**
 * Store the response for an idempotency key after successful execution.
 * Call this after the handler produces a response.
 */
export async function storeIdempotencyResult(
    request: NextRequest,
    response: NextResponse,
): Promise<void> {
    const key = request.headers.get('Idempotency-Key');
    if (!key) return;

    try {
        const body = await response.clone().text();

        await db.update(idempotencyKeys).set({
            statusCode: response.status,
            responseBody: body,
            status: 'completed',
            expiresAt: new Date(Date.now() + KEY_TTL_MS),
        }).where(eq(idempotencyKeys.key, key));
    } catch (error) {
        // Don't fail the request if idempotency storage fails
        console.error('Failed to store idempotency key:', error);
    }
}

/**
 * Wraps a handler with idempotency key support.
 * Usage:
 *   export const POST = withIdempotency(async (request) => { ... });
 */
export function withIdempotency(
    handler: (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>
) {
    return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
        const key = request.headers.get('Idempotency-Key');

        // Check for cached response
        const cached = await checkIdempotencyKey(request);
        if (cached) return cached;

        // Atomic "reserve" the key
        if (key) {
            try {
                await db.insert(idempotencyKeys).values({
                    key,
                    method: request.method,
                    path: request.nextUrl.pathname,
                    statusCode: 202, // Placeholder
                    responseBody: '{}', // Placeholder
                    status: 'started',
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Short TTL for locked keys
                });
            } catch (e: any) {
                // Detect duplicate key error (Postgres: 23505)
                if (e.code === '23505') {
                    return NextResponse.json(
                        { error: 'Request already in progress' },
                        { status: 409 }
                    );
                }
                console.error('[Idempotency] Reserve failed:', e);
                return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
            }
        }

        // Execute handler
        try {
            const response = await handler(request, ...args);

            // Only store successful responses (2xx, 4xx client errors are deterministic)
            if (response.status < 500) {
                await storeIdempotencyResult(request, response);
            } else if (key) {
                // Delete the placeholder on 5xx so it can be retried
                try {
                    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
                } catch (err) {
                    console.error('[Idempotency] Cleanup failed for key:', key, err);
                    // Swallowing error to allow the original 5xx response to return
                }
            }

            return response;
        } catch (e) {
            // Clean up on crash
            if (key) {
                await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
            }
            throw e;
        }
    };
}

/**
 * Clean up expired idempotency keys. Call periodically (e.g. cron job).
 */
export async function cleanupExpiredKeys(): Promise<number> {
    const result = await db
        .delete(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, new Date()))
        .returning({ key: idempotencyKeys.key });

    return result.length;
}
