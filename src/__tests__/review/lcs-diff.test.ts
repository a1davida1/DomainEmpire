import { describe, it, expect } from 'vitest';
import { lcsDiff } from '@/lib/audit/revisions';

describe('lcsDiff', () => {
    it('returns all same for identical inputs', () => {
        const result = lcsDiff('a\nb\nc', 'a\nb\nc');
        expect(result).toEqual([
            { type: 'same', line: 'a' },
            { type: 'same', line: 'b' },
            { type: 'same', line: 'c' },
        ]);
    });

    it('detects added lines', () => {
        const result = lcsDiff('a\nc', 'a\nb\nc');
        expect(result).toEqual([
            { type: 'same', line: 'a' },
            { type: 'add', line: 'b' },
            { type: 'same', line: 'c' },
        ]);
    });

    it('detects removed lines', () => {
        const result = lcsDiff('a\nb\nc', 'a\nc');
        expect(result).toEqual([
            { type: 'same', line: 'a' },
            { type: 'remove', line: 'b' },
            { type: 'same', line: 'c' },
        ]);
    });

    it('handles complete replacement', () => {
        const result = lcsDiff('x\ny', 'a\nb');
        const adds = result.filter(r => r.type === 'add');
        const removes = result.filter(r => r.type === 'remove');
        expect(adds.length).toBe(2);
        expect(removes.length).toBe(2);
    });

    it('handles empty old text', () => {
        // ''.split('\n') = [''] — so the empty string is treated as one empty line
        const result = lcsDiff('', 'a\nb');
        const adds = result.filter(r => r.type === 'add');
        expect(adds.map(r => r.line)).toEqual(['a', 'b']);
    });

    it('handles empty new text', () => {
        const result = lcsDiff('a\nb', '');
        const removes = result.filter(r => r.type === 'remove');
        expect(removes.map(r => r.line)).toEqual(['a', 'b']);
    });

    it('handles interleaved changes correctly', () => {
        const result = lcsDiff(
            'header\nold line 1\nshared\nold line 2\nfooter',
            'header\nnew line 1\nshared\nnew line 2\nfooter'
        );
        expect(result).toEqual([
            { type: 'same', line: 'header' },
            { type: 'remove', line: 'old line 1' },
            { type: 'add', line: 'new line 1' },
            { type: 'same', line: 'shared' },
            { type: 'remove', line: 'old line 2' },
            { type: 'add', line: 'new line 2' },
            { type: 'same', line: 'footer' },
        ]);
    });

    it('handles duplicate lines correctly', () => {
        // The old simpleDiff used Set and would misidentify duplicates
        // LCS of ['a','a','b'] and ['a','b','a'] has length 2
        const result = lcsDiff('a\na\nb', 'a\nb\na');
        const sameCount = result.filter(r => r.type === 'same').length;
        expect(sameCount).toBe(2);
        // Total entries should account for all lines from both sides
        const addCount = result.filter(r => r.type === 'add').length;
        const removeCount = result.filter(r => r.type === 'remove').length;
        expect(sameCount + removeCount).toBe(3); // old side: 3 lines
        expect(sameCount + addCount).toBe(3);    // new side: 3 lines
    });

    it('produces minimal diff for appended lines', () => {
        const result = lcsDiff('line 1\nline 2', 'line 1\nline 2\nline 3\nline 4');
        expect(result).toEqual([
            { type: 'same', line: 'line 1' },
            { type: 'same', line: 'line 2' },
            { type: 'add', line: 'line 3' },
            { type: 'add', line: 'line 4' },
        ]);
    });

    it('produces minimal diff for prepended lines', () => {
        const result = lcsDiff('line 1\nline 2', 'line 0\nline 1\nline 2');
        expect(result).toEqual([
            { type: 'add', line: 'line 0' },
            { type: 'same', line: 'line 1' },
            { type: 'same', line: 'line 2' },
        ]);
    });
});
