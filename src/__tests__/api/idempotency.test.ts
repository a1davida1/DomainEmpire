import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
    eq: vi.fn().mockReturnValue({ type: 'eq' }),
    lt: vi.fn().mockReturnValue({ type: 'lt' }),
}));

// Mock db
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockReturning = vi.fn();

vi.mock('@/lib/db', () => ({
    db: {
        select: () => {
            mockSelect();
            return {
                from: (...args: unknown[]) => {
                    mockFrom(...args);
                    return {
                        where: (...wArgs: unknown[]) => {
                            mockWhere(...wArgs);
                            return { limit: (...lArgs: unknown[]) => { mockLimit(...lArgs); return Promise.resolve([]); } };
                        },
                    };
                },
            };
        },
        delete: (...args: unknown[]) => {
            mockDelete(...args);
            return {
                where: () => ({
                    returning: () => {
                        mockReturning();
                        return Promise.resolve([]);
                    },
                }),
            };
        },
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return {
                values: (...vArgs: unknown[]) => {
                    mockValues(...vArgs);
                    return { onConflictDoNothing: () => { mockOnConflictDoNothing(); return Promise.resolve(); } };
                },
            };
        },
    },
    idempotencyKeys: { key: 'key', method: 'method', path: 'path', expiresAt: 'expires_at' },
}));

// Import after mocks
const { checkIdempotencyKey, storeIdempotencyResult, cleanupExpiredKeys } = await import('@/lib/api/idempotency');

function makeRequest(headers: Record<string, string> = {}, method = 'POST', pathname = '/api/test') {
    return {
        headers: { get: (name: string) => headers[name] || null },
        method,
        nextUrl: { pathname },
    } as any;
}

describe('checkIdempotencyKey', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns null when no Idempotency-Key header', async () => {
        const result = await checkIdempotencyKey(makeRequest());
        expect(result).toBeNull();
    });

    it('rejects keys longer than 255 characters', async () => {
        const longKey = 'a'.repeat(256);
        const result = await checkIdempotencyKey(makeRequest({ 'Idempotency-Key': longKey }));
        expect(result).not.toBeNull();
        const body = await result!.json();
        expect(body.error).toContain('Invalid Idempotency-Key');
    });

    it('rejects keys with invalid characters', async () => {
        const result = await checkIdempotencyKey(makeRequest({ 'Idempotency-Key': 'key with spaces!' }));
        expect(result).not.toBeNull();
        const body = await result!.json();
        expect(body.error).toContain('Invalid Idempotency-Key');
    });

    it('accepts valid UUID-style keys', async () => {
        const result = await checkIdempotencyKey(makeRequest({ 'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000' }));
        // Returns null because our mock DB returns empty array (no cached response)
        expect(result).toBeNull();
    });

    it('accepts alphanumeric keys with hyphens and underscores', async () => {
        const result = await checkIdempotencyKey(makeRequest({ 'Idempotency-Key': 'my_key-123' }));
        expect(result).toBeNull();
    });
});

describe('storeIdempotencyResult', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does nothing when no Idempotency-Key header', async () => {
        const request = makeRequest();
        const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
        await storeIdempotencyResult(request, response as any);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('stores the response when key is present', async () => {
        const request = makeRequest({ 'Idempotency-Key': 'test-key-1' });
        const response = new Response(JSON.stringify({ ok: true }), { status: 201 });
        // Need to create a NextResponse-like object with clone() and status
        const mockResponse = {
            clone: () => ({ text: () => Promise.resolve(JSON.stringify({ ok: true })) }),
            status: 201,
        };
        await storeIdempotencyResult(request, mockResponse as any);
        expect(mockInsert).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
            key: 'test-key-1',
            statusCode: 201,
        }));
    });
});

describe('cleanupExpiredKeys', () => {
    it('returns count of deleted keys', async () => {
        const count = await cleanupExpiredKeys();
        expect(typeof count).toBe('number');
    });
});
