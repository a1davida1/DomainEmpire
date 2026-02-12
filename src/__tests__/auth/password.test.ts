import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('hashPassword', () => {
    it('produces salt:hash format', async () => {
        const hash = await hashPassword('testpassword');
        const parts = hash.split(':');
        expect(parts).toHaveLength(2);
        expect(parts[0].length).toBe(64); // 32 bytes hex = 64 chars
        expect(parts[1].length).toBe(128); // 64 bytes hex = 128 chars
    });

    it('produces different hashes for same password (random salt)', async () => {
        const hash1 = await hashPassword('samepassword');
        const hash2 = await hashPassword('samepassword');
        expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', async () => {
        const hash = await hashPassword('');
        expect(hash.split(':')).toHaveLength(2);
    });

    it('handles unicode passwords', async () => {
        const hash = await hashPassword('pässwörd日本語');
        expect(hash.split(':')).toHaveLength(2);
    });
});

describe('verifyPassword', () => {
    it('verifies correct password', async () => {
        const hash = await hashPassword('correctpassword');
        expect(await verifyPassword('correctpassword', hash)).toBe(true);
    });

    it('rejects wrong password', async () => {
        const hash = await hashPassword('correctpassword');
        expect(await verifyPassword('wrongpassword', hash)).toBe(false);
    });

    it('rejects malformed hash (no colon)', async () => {
        expect(await verifyPassword('test', 'nocolonhere')).toBe(false);
    });

    it('rejects empty salt', async () => {
        expect(await verifyPassword('test', ':abc123')).toBe(false);
    });

    it('rejects empty hash', async () => {
        expect(await verifyPassword('test', 'abc123:')).toBe(false);
    });

    it('is case-sensitive', async () => {
        const hash = await hashPassword('CaseSensitive');
        expect(await verifyPassword('casesensitive', hash)).toBe(false);
        expect(await verifyPassword('CaseSensitive', hash)).toBe(true);
    });
});
