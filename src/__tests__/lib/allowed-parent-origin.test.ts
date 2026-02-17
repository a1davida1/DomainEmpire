import { describe, expect, it } from 'vitest';

import { deriveAllowedParentOrigin } from '../../lib/deploy/allowed-parent-origin';

function makeRequestLike(origin: string, headers: Record<string, string> = {}) {
    return {
        nextUrl: { origin },
        headers: {
            get(name: string) {
                const key = name.toLowerCase();
                return headers[key] ?? null;
            },
        },
    };
}

describe('deriveAllowedParentOrigin', () => {
    it('prefers request origin over unrelated configured origin', () => {
        const request = makeRequestLike('http://localhost:3000', {
            origin: 'http://localhost:3000',
        });

        const result = deriveAllowedParentOrigin(request, 'https://dashboard.example.com');
        expect(result).toBe('http://localhost:3000');
    });

    it('accepts referer origin when origin header is missing', () => {
        const request = makeRequestLike('http://localhost:3000', {
            referer: 'http://localhost:3000/dashboard/domains/abc/pages',
        });

        const result = deriveAllowedParentOrigin(request, null);
        expect(result).toBe('http://localhost:3000');
    });

    it('falls back to request nextUrl origin when headers are absent', () => {
        const request = makeRequestLike('http://localhost:3000');

        const result = deriveAllowedParentOrigin(request, null);
        expect(result).toBe('http://localhost:3000');
    });

    it('ignores invalid configured origin values', () => {
        const request = makeRequestLike('http://localhost:3000', {
            origin: 'http://localhost:3000',
        });

        const result = deriveAllowedParentOrigin(request, 'not a valid url');
        expect(result).toBe('http://localhost:3000');
    });
});
