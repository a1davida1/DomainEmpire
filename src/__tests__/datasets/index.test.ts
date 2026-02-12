import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// Mirror the recursive sortedStringify from datasets/index.ts
function sortedStringify(value: unknown): string {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(sortedStringify).join(',') + ']';
    if (typeof value === 'object') {
        const sorted = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b))
            .map(k => JSON.stringify(k) + ':' + sortedStringify((value as Record<string, unknown>)[k]));
        return '{' + sorted.join(',') + '}';
    }
    return JSON.stringify(value);
}

function hashData(data: unknown): string {
    return createHash('sha256').update(sortedStringify(data)).digest('hex');
}

describe('Dataset hash computation', () => {
    it('produces consistent SHA-256 hash', () => {
        const data = { rate: 5.5, year: 2024, source: 'Fed' };
        const hash1 = hashData(data);
        const hash2 = hashData(data);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('produces different hashes for different data', () => {
        const data1 = { rate: 5.5 };
        const data2 = { rate: 5.6 };
        expect(hashData(data1)).not.toBe(hashData(data2));
    });

    it('produces same hash regardless of key order', () => {
        const data1 = { a: 1, b: 2, c: 3 };
        const data2 = { c: 3, a: 1, b: 2 };
        expect(hashData(data1)).toBe(hashData(data2));
    });

    it('handles empty object', () => {
        const hash = hashData({});
        expect(hash).toHaveLength(64);
    });

    it('produces same hash for nested objects regardless of key order', () => {
        const data1 = { outer: { z: 1, a: 2 }, meta: { y: { d: 4, c: 3 } } };
        const data2 = { meta: { y: { c: 3, d: 4 } }, outer: { a: 2, z: 1 } };
        expect(hashData(data1)).toBe(hashData(data2));
    });

    it('handles arrays (order matters), nested objects (key order does not)', () => {
        const data1 = { items: [1, 2, 3], config: { b: 'x', a: 'y' } };
        const data2 = { config: { a: 'y', b: 'x' }, items: [1, 2, 3] };
        expect(hashData(data1)).toBe(hashData(data2));

        // Array order DOES matter
        const data3 = { items: [3, 2, 1], config: { a: 'y', b: 'x' } };
        expect(hashData(data1)).not.toBe(hashData(data3));
    });

    it('handles null and undefined values inside objects', () => {
        const data1 = { a: null, b: 1 };
        const data2 = { b: 1, a: null };
        expect(hashData(data1)).toBe(hashData(data2));
    });

    it('detects when data is unchanged (same hash)', () => {
        const original = { rates: [3.5, 4.0, 4.5], updated: '2024-01-01' };
        const refreshed = { rates: [3.5, 4.0, 4.5], updated: '2024-01-01' };
        expect(hashData(original)).toBe(hashData(refreshed));
        // This means no version bump should happen
    });

    it('detects when data has changed (different hash)', () => {
        const original = { rates: [3.5, 4.0, 4.5], updated: '2024-01-01' };
        const refreshed = { rates: [3.5, 4.0, 5.0], updated: '2024-02-01' };
        expect(hashData(original)).not.toBe(hashData(refreshed));
        // This means version should be bumped
    });
});
